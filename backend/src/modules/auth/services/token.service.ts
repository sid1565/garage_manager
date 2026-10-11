import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EntityManager, IsNull, LessThan, Repository } from 'typeorm';
import { REFRESH_TOKEN_BYTES } from '../../../common/constants/auth.constants';
import { IJwtPayload } from '../../../common/interfaces/auth-user.interface';
import { durationToSeconds } from '../../../common/utils/duration.util';
import { User } from '../../staff/entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { IIssuedTokens, IRequestMeta } from '../interfaces/request-meta.interface';

export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Token lifecycle:
 *  - access: ES256 JWT, 15 min, claims {sub, role, gid, sid}; never stored server-side.
 *  - refresh: 256-bit random, stored as SHA-256; one `family_id` per login (= `sid`);
 *    rotated on every use; reuse of a rotated token revokes the whole family.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
  ) {
    this.accessTtlSeconds = durationToSeconds(config.get<string>('jwt.accessExpiresIn', '15m'));
    this.refreshTtlDays = config.get<number>('jwt.refreshTtlDays', 7);
  }

  /** Starts a new session (login, register, change-password). */
  async issueForNewSession(
    user: Pick<User, 'id' | 'role' | 'garageId'>,
    meta: IRequestMeta,
    manager?: EntityManager,
  ): Promise<IIssuedTokens> {
    const familyId = randomUUID();
    const refresh = await this.createRefreshToken(user.id, familyId, meta, manager);
    return this.bundle(user, familyId, refresh);
  }

  /** Issues the successor of a refresh token inside the caller's locking transaction. */
  async issueRotated(
    user: Pick<User, 'id' | 'role' | 'garageId'>,
    previous: RefreshToken,
    meta: IRequestMeta,
    manager: EntityManager,
  ): Promise<IIssuedTokens> {
    const refresh = await this.createRefreshToken(user.id, previous.familyId, meta, manager);
    await manager
      .getRepository(RefreshToken)
      .update({ id: previous.id }, { revokedAt: new Date(), replacedById: refresh.entity.id });
    return this.bundle(user, previous.familyId, refresh);
  }

  /** Locks the row so two concurrent refreshes can't both rotate the same token. */
  findByRawForUpdate(raw: string, manager: EntityManager): Promise<RefreshToken | null> {
    return manager
      .getRepository(RefreshToken)
      .createQueryBuilder('rt')
      .setLock('pessimistic_write')
      .where('rt.token_hash = :hash', { hash: hashToken(raw) })
      .getOne();
  }

  findByRaw(raw: string): Promise<RefreshToken | null> {
    return this.refreshRepo.findOne({ where: { tokenHash: hashToken(raw) } });
  }

  async revokeFamily(familyId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(RefreshToken) : this.refreshRepo;
    await repo.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(RefreshToken) : this.refreshRepo;
    await repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Expired rows are useless — keep the table (and its family_id index) small. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const result = await this.refreshRepo.delete({ expiresAt: LessThan(cutoff) });
    this.logger.log(`Pruned ${result.affected ?? 0} expired refresh tokens`);
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    meta: IRequestMeta,
    manager?: EntityManager,
  ): Promise<{ raw: string; entity: RefreshToken }> {
    const repo = manager ? manager.getRepository(RefreshToken) : this.refreshRepo;
    const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const entity = await repo.save(
      repo.create({
        userId,
        familyId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 86400 * 1000),
        createdByIp: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      }),
    );
    return { raw, entity };
  }

  private async bundle(
    user: Pick<User, 'id' | 'role' | 'garageId'>,
    familyId: string,
    refresh: { raw: string; entity: RefreshToken },
  ): Promise<IIssuedTokens> {
    const payload: IJwtPayload = {
      sub: user.id,
      role: user.role,
      gid: user.garageId,
      sid: familyId,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiresIn: this.accessTtlSeconds,
      refreshToken: refresh.raw,
      refreshExpiresAt: refresh.entity.expiresAt,
    };
  }
}
