import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IServiceResult } from '../../../common/interfaces';
import {
  formatMinor,
  lineTotalMinor,
  parseMinor,
  percentOfMinor,
  sumMinor,
} from '../../../common/utils/money.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { ICustomerLinkContext } from '../../customer-links/interfaces/customer-link-context.interface';
import { CustomerLinkService } from '../../customer-links/services/customer-link.service';
import { Garage } from '../../garages/entities/garage.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { Problem } from '../../job-cards/entities/problem.entity';
import { JobCardStatus } from '../../job-cards/enums/job-card-status.enum';
import {
  applyStatusChange,
  assertNotClosed,
  findJobInGarage,
} from '../../job-cards/utils/job-access.util';
import { assertSystemTransition } from '../../job-cards/utils/job-status.machine';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  EstimateDecisionDto,
  EstimateDto,
  EstimateLineItemInputDto,
  EstimateSummaryDto,
  SendEstimateDto,
  SentEstimateDto,
  UpsertEstimateDto,
  VerbalApprovalDto,
} from '../dto/estimate.dto';
import { EstimateLineItem } from '../entities/estimate-line-item.entity';
import { Estimate } from '../entities/estimate.entity';
import { ApprovalMethod } from '../enums/approval-method.enum';
import { EstimateStatus } from '../enums/estimate-status.enum';
import { LineItemApproval } from '../enums/line-item-approval.enum';

const DEFAULT_VALIDITY_DAYS = 7;
const RESPONDED = [
  EstimateStatus.APPROVED,
  EstimateStatus.PARTIALLY_APPROVED,
  EstimateStatus.REJECTED,
];

interface IResponder {
  method: ApprovalMethod;
  staffId: string | null;
  note: string | null;
  linkId: string | null;
}

export const toEstimateSummary = (e: Estimate): EstimateSummaryDto => ({
  id: e.id,
  jobCardId: e.jobCardId,
  version: e.version,
  status: e.status,
  subtotal: e.subtotal,
  taxRate: e.taxRate,
  taxAmount: e.taxAmount,
  total: e.total,
  approvedTotal: e.approvedTotal,
  validUntil: e.validUntil,
  sentAt: e.sentAt,
  respondedAt: e.respondedAt,
  approvalMethod: e.approvalMethod,
  createdBy: { id: e.createdBy.id, name: e.createdBy.name },
  createdAt: e.createdAt,
});

/**
 * UC-11 / UC-12. Money is computed here in BigInt minor units — clients never send
 * totals (NFR-6, AC-11.1). Estimates are always reached through their job card's
 * garage (tenant:same-garage) or through the owner's link (link-scoped).
 */
@Injectable()
export class EstimatesService {
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Estimate) private readonly estimateRepo: Repository<Estimate>,
    @InjectRepository(EstimateLineItem) private readonly itemRepo: Repository<EstimateLineItem>,
    private readonly linkService: CustomerLinkService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async listForJob(
    user: IAuthUser,
    jobCardId: string,
    lang: string,
  ): Promise<IServiceResult<EstimateSummaryDto[]>> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    const rows = await this.estimateRepo.find({
      where: { jobCardId },
      relations: { createdBy: true },
      order: { version: 'DESC' },
    });
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('ESTIMATE', this.i18n, lang),
      data: rows.map(toEstimateSummary),
    };
  }

  /** DRAFT at version max+1; tax rate snapshotted from the garage. */
  async create(
    user: IAuthUser,
    jobCardId: string,
    dto: UpsertEstimateDto,
    lang: string,
  ): Promise<IServiceResult<EstimateDto>> {
    const garageId = requireGarageId(user);
    const id = await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      await this.assertEstimable(manager, job);
      await this.assertProblemsBelong(manager, jobCardId, dto.items);
      const garage = await manager.getRepository(Garage).findOneOrFail({ where: { id: garageId } });
      const last = await manager
        .getRepository(Estimate)
        .findOne({ where: { jobCardId }, order: { version: 'DESC' } });
      const repo = manager.getRepository(Estimate);
      const estimate = await repo.save(
        repo.create({
          jobCardId,
          version: (last?.version ?? 0) + 1,
          status: EstimateStatus.DRAFT,
          taxRate: garage.taxRate,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          createdById: user.id,
        }),
      );
      await this.writeItems(manager, estimate, dto.items);
      await this.audit(manager, user, AUDIT_ACTIONS.ESTIMATE_CREATED, estimate.id, {
        jobCardId,
        version: estimate.version,
        total: estimate.total,
      });
      return estimate.id;
    });
    return {
      message: SUCCESS.RECORD_CREATED('ESTIMATE', this.i18n, lang),
      data: await this.loadDto(id),
    };
  }

  async findOne(
    user: IAuthUser,
    estimateId: string,
    lang: string,
  ): Promise<IServiceResult<EstimateDto>> {
    await this.findInGarage(this.dataSource.manager, requireGarageId(user), estimateId);
    return {
      message: SUCCESS.RECORD_FETCHED('ESTIMATE', this.i18n, lang),
      data: await this.loadDto(estimateId),
    };
  }

  /** Idempotent replacement of a DRAFT's lines; tax re-snapshotted (it's still a draft). */
  async replace(
    user: IAuthUser,
    estimateId: string,
    dto: UpsertEstimateDto,
    lang: string,
  ): Promise<IServiceResult<EstimateDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const { estimate, job } = await this.findInGarage(manager, garageId, estimateId, true);
      if (estimate.status !== EstimateStatus.DRAFT) throw apiError('ESTIMATE_NOT_DRAFT');
      await this.assertProblemsBelong(manager, job.id, dto.items);
      const garage = await manager.getRepository(Garage).findOneOrFail({ where: { id: garageId } });
      estimate.taxRate = garage.taxRate;
      estimate.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
      await manager.getRepository(EstimateLineItem).delete({ estimateId });
      await this.writeItems(manager, estimate, dto.items);
      await this.audit(manager, user, AUDIT_ACTIONS.ESTIMATE_UPDATED, estimateId, {
        total: estimate.total,
      });
    });
    return {
      message: SUCCESS.RECORD_UPDATED('ESTIMATE', this.i18n, lang),
      data: await this.loadDto(estimateId),
    };
  }

  /**
   * UC-11 send (AC-11.2/11.3/11.4), one transaction: supersede the previous SENT version
   * (and kill its link), mark SENT, create the APPROVE_ESTIMATE link, move the job to
   * AWAITING_APPROVAL, queue ESTIMATE_SENT per channel.
   */
  async send(
    user: IAuthUser,
    estimateId: string,
    dto: SendEstimateDto,
    lang: string,
  ): Promise<IServiceResult<SentEstimateDto>> {
    const garageId = requireGarageId(user);
    const queued = await this.dataSource.transaction(async (manager) => {
      const { estimate, job } = await this.findInGarage(manager, garageId, estimateId, true);
      if (estimate.status !== EstimateStatus.DRAFT) throw apiError('ESTIMATE_NOT_DRAFT');
      const items = await manager.getRepository(EstimateLineItem).count({ where: { estimateId } });
      if (items === 0) throw apiError('NO_LINE_ITEMS');
      assertNotClosed(job);
      assertSystemTransition(job.status, JobCardStatus.AWAITING_APPROVAL);

      const previous = await manager
        .getRepository(Estimate)
        .find({ where: { jobCardId: job.id, status: EstimateStatus.SENT } });
      for (const old of previous) {
        await manager
          .getRepository(Estimate)
          .update({ id: old.id }, { status: EstimateStatus.SUPERSEDED });
        await this.linkService.revokeForEstimate(old.id, manager);
      }

      const now = new Date();
      const validUntil =
        estimate.validUntil && estimate.validUntil > now
          ? estimate.validUntil
          : new Date(now.getTime() + DEFAULT_VALIDITY_DAYS * 86400 * 1000);
      await manager
        .getRepository(Estimate)
        .update({ id: estimateId }, { status: EstimateStatus.SENT, sentAt: now, validUntil });
      const link = await this.linkService.create(
        {
          garageId,
          jobCardId: job.id,
          estimateId,
          purpose: LinkPurpose.APPROVE_ESTIMATE,
          expiresAt: validUntil,
        },
        manager,
      );
      await applyStatusChange(manager, job, JobCardStatus.AWAITING_APPROVAL, user.id);
      const rows = await this.notificationsService.enqueue(
        {
          garageId,
          type: NotificationType.ESTIMATE_SENT,
          channels: dto.channels,
          customerId: job.customerId,
          jobCardId: job.id,
          linkUrl: link.url,
          message: dto.message,
          templateData: {
            total: estimate.total,
            validUntil: validUntil.toISOString().slice(0, 10),
          },
          createdById: user.id,
        },
        manager,
      );
      if (rows.length === 0) throw apiError('NO_CONTACT_FOR_CHANNEL');
      await this.audit(manager, user, AUDIT_ACTIONS.ESTIMATE_SENT, estimateId, {
        version: estimate.version,
        total: estimate.total,
        superseded: previous.map((p) => p.id),
      });
      return rows.length;
    });
    return {
      message: SUCCESS.ESTIMATE_SENT(this.i18n, lang),
      data: { ...(await this.loadDto(estimateId)), notificationsQueued: queued },
    };
  }

  /** UC-12 2a / AC-12.9: staff record the owner's decision; the note is mandatory (DTO). */
  async recordVerbalApproval(
    user: IAuthUser,
    estimateId: string,
    dto: VerbalApprovalDto,
    lang: string,
  ): Promise<IServiceResult<EstimateDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const { estimate, job } = await this.findInGarage(manager, garageId, estimateId, true);
      await this.applyDecision(manager, estimate, job, dto, {
        method: ApprovalMethod.VERBAL,
        staffId: user.id,
        note: dto.note.trim(),
        linkId: null,
      });
    });
    return {
      message: SUCCESS.ESTIMATE_RESPONDED(this.i18n, lang),
      data: await this.loadDto(estimateId),
    };
  }

  /** UC-12 via the owner's link — scope comes ONLY from the link (link-scoped). */
  async respondViaLink(
    link: ICustomerLinkContext,
    dto: EstimateDecisionDto,
    lang: string,
  ): Promise<IServiceResult<EstimateDto>> {
    if (!link.estimateId) throw apiError('NOT_FOUND');
    const estimateId = link.estimateId;
    await this.dataSource.transaction(async (manager) => {
      const { estimate, job } = await this.findInGarage(manager, link.garageId, estimateId, true);
      if (job.id !== link.jobCardId) throw apiError('NOT_FOUND');
      await this.applyDecision(manager, estimate, job, dto, {
        method: ApprovalMethod.CUSTOMER_LINK,
        staffId: null,
        note: null,
        linkId: link.linkId,
      });
    });
    return {
      message: SUCCESS.ESTIMATE_RESPONDED(this.i18n, lang),
      data: await this.loadDto(estimateId),
    };
  }

  async remove(user: IAuthUser, estimateId: string, _lang: string): Promise<void> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const { estimate } = await this.findInGarage(manager, garageId, estimateId, true);
      if (estimate.status !== EstimateStatus.DRAFT) throw apiError('ESTIMATE_NOT_DRAFT');
      await manager.getRepository(Estimate).delete({ id: estimateId }); // items cascade
      await this.audit(manager, user, AUDIT_ACTIONS.ESTIMATE_DELETED, estimateId, {
        version: estimate.version,
      });
    });
  }

  /**
   * Shared UC-12 core (link + verbal). Every line must be decided exactly once; the
   * estimate becomes APPROVED / PARTIALLY_APPROVED / REJECTED and the job moves on.
   */
  private async applyDecision(
    manager: EntityManager,
    estimate: Estimate,
    job: JobCard,
    dto: EstimateDecisionDto,
    responder: IResponder,
  ): Promise<void> {
    if (RESPONDED.includes(estimate.status)) throw apiError('ESTIMATE_ALREADY_RESPONDED'); // AC-12.7
    if (estimate.status !== EstimateStatus.SENT) throw apiError('ESTIMATE_EXPIRED');
    if (estimate.validUntil && estimate.validUntil <= new Date())
      throw apiError('ESTIMATE_EXPIRED');

    const items = await manager
      .getRepository(EstimateLineItem)
      .find({ where: { estimateId: estimate.id } });
    const decisions = new Map<string, boolean>();
    for (const d of dto.decisions) {
      if (!items.some((i) => i.id === d.lineItemId)) throw apiError('UNKNOWN_LINE_ITEM');
      if (decisions.has(d.lineItemId)) throw apiError('DECISIONS_INCOMPLETE');
      decisions.set(d.lineItemId, d.approved);
    }
    if (decisions.size !== items.length) throw apiError('DECISIONS_INCOMPLETE');

    const approvedIds = items.filter((i) => decisions.get(i.id)).map((i) => i.id);
    const rejectedIds = items.filter((i) => !decisions.get(i.id)).map((i) => i.id);
    const itemRepo = manager.getRepository(EstimateLineItem);
    if (approvedIds.length) {
      await itemRepo.update({ id: In(approvedIds) }, { approvalState: LineItemApproval.APPROVED });
    }
    if (rejectedIds.length) {
      await itemRepo.update({ id: In(rejectedIds) }, { approvalState: LineItemApproval.REJECTED });
    }

    const approvedSubtotal = sumMinor(
      items.filter((i) => decisions.get(i.id)).map((i) => parseMinor(i.lineTotal)),
    );
    const approvedTotal = approvedSubtotal + percentOfMinor(approvedSubtotal, estimate.taxRate);
    const status =
      rejectedIds.length === 0
        ? EstimateStatus.APPROVED
        : approvedIds.length === 0
          ? EstimateStatus.REJECTED
          : EstimateStatus.PARTIALLY_APPROVED;

    await manager.getRepository(Estimate).update(
      { id: estimate.id },
      {
        status,
        approvedTotal: formatMinor(approvedTotal),
        respondedAt: new Date(),
        customerRemark: dto.remark?.trim() || null,
        approvalMethod: responder.method,
        verbalApprovalNote: responder.note,
        respondedByStaffId: responder.staffId,
      },
    );

    // Problems quoted on this estimate no longer need a new one (UC-9 1b).
    const quotedProblems = items.map((i) => i.problemId).filter((id): id is string => !!id);
    if (quotedProblems.length) {
      await manager
        .getRepository(Problem)
        .update({ id: In(quotedProblems) }, { requiresNewEstimate: false });
    }

    // Rejected extra work on a job that already has approved work resumes that work.
    const nextJobStatus =
      status === EstimateStatus.REJECTED && !(await this.hasEarlierApproval(manager, estimate))
        ? JobCardStatus.DIAGNOSING
        : JobCardStatus.APPROVED;
    assertSystemTransition(job.status, nextJobStatus);
    await applyStatusChange(manager, job, nextJobStatus, responder.staffId, responder.note);

    if (responder.linkId) await this.linkService.markUsed(responder.linkId, manager);
    await this.auditService.record(
      {
        garageId: job.garageId,
        actorType: responder.staffId ? ActorType.STAFF : ActorType.CUSTOMER,
        actorUserId: responder.staffId,
        action: responder.staffId
          ? AUDIT_ACTIONS.ESTIMATE_APPROVED_VERBALLY
          : AUDIT_ACTIONS.ESTIMATE_RESPONDED,
        entityType: 'estimate',
        entityId: estimate.id,
        changes: { status, approvedTotal: formatMinor(approvedTotal), note: responder.note },
      },
      manager,
    );

    if (status !== EstimateStatus.REJECTED) {
      const view = await this.linkService.create(
        { garageId: job.garageId, jobCardId: job.id, purpose: LinkPurpose.VIEW_JOB },
        manager,
      );
      await this.notificationsService.enqueue(
        {
          garageId: job.garageId,
          type: NotificationType.JOB_APPROVED,
          customerId: job.customerId,
          jobCardId: job.id,
          linkUrl: view.url,
          templateData: { approvedTotal: formatMinor(approvedTotal) },
        },
        manager,
      );
    }
  }

  private async hasEarlierApproval(manager: EntityManager, estimate: Estimate): Promise<boolean> {
    return manager.getRepository(Estimate).exist({
      where: {
        jobCardId: estimate.jobCardId,
        status: In([EstimateStatus.APPROVED, EstimateStatus.PARTIALLY_APPROVED]),
      },
    });
  }

  /** DIAGNOSING, or IN_PROGRESS with a problem flagged as needing a new estimate (UC-9 1b). */
  private async assertEstimable(manager: EntityManager, job: JobCard): Promise<void> {
    if (job.status === JobCardStatus.DIAGNOSING) return;
    if (job.status === JobCardStatus.IN_PROGRESS) {
      const extra = await manager
        .getRepository(Problem)
        .exist({ where: { jobCardId: job.id, requiresNewEstimate: true } });
      if (extra) return;
    }
    throw apiError('JOB_NOT_ESTIMABLE');
  }

  private async assertProblemsBelong(
    manager: EntityManager,
    jobCardId: string,
    items: EstimateLineItemInputDto[],
  ): Promise<void> {
    const ids = [...new Set(items.map((i) => i.problemId).filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    const found = await manager.getRepository(Problem).count({ where: { id: In(ids), jobCardId } });
    if (found !== ids.length) throw apiError('INVALID_PROBLEM_REFERENCE');
  }

  /** Inserts lines and stores server-computed totals on the estimate (AC-11.1). */
  private async writeItems(
    manager: EntityManager,
    estimate: Estimate,
    items: EstimateLineItemInputDto[],
  ): Promise<void> {
    const lines = items.map((item) => ({
      item,
      total: lineTotalMinor(item.quantity, item.unitPrice),
    }));
    await manager.getRepository(EstimateLineItem).insert(
      lines.map(({ item, total }, index) => ({
        estimateId: estimate.id,
        problemId: item.problemId ?? null,
        itemType: item.itemType,
        description: item.description.trim(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: formatMinor(total),
        sortOrder: index,
      })),
    );
    const subtotal = sumMinor(lines.map((l) => l.total));
    const tax = percentOfMinor(subtotal, estimate.taxRate);
    estimate.subtotal = formatMinor(subtotal);
    estimate.taxAmount = formatMinor(tax);
    estimate.total = formatMinor(subtotal + tax);
    await manager.getRepository(Estimate).save(estimate);
  }

  /** Estimate + its job, scoped to the garage through the job card. */
  private async findInGarage(
    manager: EntityManager,
    garageId: string,
    estimateId: string,
    lock = false,
  ): Promise<{ estimate: Estimate; job: JobCard }> {
    const estimate = await manager.getRepository(Estimate).findOne({
      where: { id: estimateId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!estimate) throw apiError('NOT_FOUND');
    const job = await findJobInGarage(manager, garageId, estimate.jobCardId, lock);
    return { estimate, job };
  }

  private async loadDto(estimateId: string): Promise<EstimateDto> {
    const estimate = await this.estimateRepo.findOneOrFail({
      where: { id: estimateId },
      relations: { createdBy: true },
    });
    const items = await this.itemRepo.find({ where: { estimateId }, order: { sortOrder: 'ASC' } });
    return {
      ...toEstimateSummary(estimate),
      customerRemark: estimate.customerRemark,
      verbalApprovalNote: estimate.verbalApprovalNote,
      items: items.map((i) => ({
        id: i.id,
        itemType: i.itemType,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
        approvalState: i.approvalState,
        problemId: i.problemId,
        sortOrder: i.sortOrder,
      })),
      updatedAt: estimate.updatedAt,
    };
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    estimateId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'estimate',
        entityId: estimateId,
        changes,
      },
      manager,
    );
  }
}
