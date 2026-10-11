import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { LINK_TOKEN_BYTES } from '../../../common/constants/auth.constants';
import { CustomerAccessLink } from '../entities/customer-access-link.entity';
import { LinkPurpose } from '../enums/link-purpose.enum';
import { ICustomerLinkContext } from '../interfaces/customer-link-context.interface';

/** base64url of 32 bytes is exactly 43 chars — anything else is rejected without a DB hit. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

export interface ICreateLinkInput {
  garageId: string;
  jobCardId: string;
  purpose: LinkPurpose;
  estimateId?: string | null;
  /** Defaults to CUSTOMER_LINK_TTL_DAYS. APPROVE_ESTIMATE links pass the estimate's valid_until. */
  expiresAt?: Date;
}

/**
 * NFR-5 customer links: 256-bit random tokens, only the SHA-256 hash is stored,
 * single purpose, expiring, revocable. The raw token exists only in the
 * notification sent to the owner.
 */
@Injectable()
export class CustomerLinkService {
  private readonly ttlDays: number;
  private readonly portalUrl: string;

  constructor(
    config: ConfigService,
    @InjectRepository(CustomerAccessLink)
    private readonly linkRepo: Repository<CustomerAccessLink>,
  ) {
    this.ttlDays = config.get<number>('customerPortal.linkTtlDays', 7);
    this.portalUrl = config.get<string>('customerPortal.url', 'http://localhost:3000/portal');
  }

  /** Create inside the caller's transaction; returns the raw token and the full URL. */
  async create(
    input: ICreateLinkInput,
    manager?: EntityManager,
  ): Promise<{ token: string; url: string; link: CustomerAccessLink }> {
    const repo = manager ? manager.getRepository(CustomerAccessLink) : this.linkRepo;
    const token = randomBytes(LINK_TOKEN_BYTES).toString('base64url');
    const link = await repo.save(
      repo.create({
        garageId: input.garageId,
        jobCardId: input.jobCardId,
        estimateId: input.estimateId ?? null,
        purpose: input.purpose,
        tokenHash: hashToken(token),
        expiresAt: input.expiresAt ?? new Date(Date.now() + this.ttlDays * 86400 * 1000),
      }),
    );
    return { token, url: `${this.portalUrl}/${token}`, link };
  }

  /** UC-11 3a — superseding an estimate kills its approval links. */
  async revokeForEstimate(estimateId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerAccessLink) : this.linkRepo;
    await repo.update({ estimateId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Job cancelled/closed — every outstanding owner link for it stops working. */
  async revokeForJob(jobCardId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerAccessLink) : this.linkRepo;
    await repo.update({ jobCardId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async markUsed(linkId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerAccessLink) : this.linkRepo;
    await repo.update({ id: linkId }, { usedAt: new Date() });
  }

  /**
   * Resolves a raw token: unknown/malformed → 404 (AC-12.6), expired or revoked → 410
   * (AC-12.5), purpose not allowed for the route → 403 (AC-12.8).
   */
  async resolve(
    rawToken: string | undefined,
    allowed: readonly LinkPurpose[],
  ): Promise<ICustomerLinkContext> {
    if (!rawToken || !TOKEN_FORMAT.test(rawToken)) throw this.notFound();
    const link = await this.linkRepo.findOne({ where: { tokenHash: hashToken(rawToken) } });
    if (!link) throw this.notFound();
    if (link.revokedAt || link.expiresAt <= new Date()) {
      throw new GoneException({
        message: 'translation.ERROR.LINK_EXPIRED',
        errorCode: 'LINK_EXPIRED',
      });
    }
    if (!allowed.includes(link.purpose)) {
      throw new ForbiddenException({
        message: 'translation.ERROR.LINK_PURPOSE_MISMATCH',
        errorCode: 'LINK_PURPOSE_MISMATCH',
      });
    }
    await this.linkRepo.update({ id: link.id }, { lastAccessedAt: new Date() });
    return {
      linkId: link.id,
      garageId: link.garageId,
      jobCardId: link.jobCardId,
      estimateId: link.estimateId,
      purpose: link.purpose,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: 'translation.ERROR.LINK_NOT_FOUND',
      errorCode: 'LINK_NOT_FOUND',
    });
  }
}
