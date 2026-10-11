import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { RecordStatus, UserRole } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import { formatMinor, parseMinor } from '../../../common/utils/money.util';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { normalizeRegistrationNumber } from '../../../common/utils/registration.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { CustomerLinkService } from '../../customer-links/services/customer-link.service';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { EstimateStatus } from '../../estimates/enums/estimate-status.enum';
import { Garage } from '../../garages/entities/garage.entity';
import { CounterType } from '../../garages/enums/counter-type.enum';
import { GarageCounterService } from '../../garages/services/garage-counter.service';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../../invoices/enums/invoice-status.enum';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { User } from '../../staff/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import {
  AssignMechanicDto,
  CancelJobCardDto,
  ChangeJobStatusDto,
  CreateJobCardDto,
  DeliverJobCardDto,
  DeliverOnCreditDto,
  JobCardDetailDto,
  JobCardListItemDto,
  JobStatusHistoryDto,
  ListJobCardsQueryDto,
  UpdateJobCardDto,
} from '../dto/job-card.dto';
import { JobCard } from '../entities/job-card.entity';
import { JobStatusHistory } from '../entities/job-status-history.entity';
import { Problem } from '../entities/problem.entity';
import { JobCardStatus, TERMINAL_JOB_STATUSES } from '../enums/job-card-status.enum';
import {
  applyStatusChange,
  assertAssignedIfMechanic,
  assertNotClosed,
  findJobInGarage,
} from '../utils/job-access.util';
import {
  assertManualTransition,
  assertSystemTransition,
  isTerminal,
  manualTargets,
} from '../utils/job-status.machine';

const ORDER_COLUMNS = new Map([
  ['createdAt', 'j.createdAt'],
  ['promisedDeliveryAt', 'j.promisedDeliveryAt'],
  ['jobNumber', 'j.jobNumber'],
]);
const OPEN_JOB_UNIQUE = 'UQ_job_cards_open_per_vehicle';
const APPROVED_ESTIMATES = [EstimateStatus.APPROVED, EstimateStatus.PARTIALLY_APPROVED];

const isOverdue = (j: JobCard): boolean =>
  !isTerminal(j.status) && !!j.promisedDeliveryAt && j.promisedDeliveryAt < new Date();

const toListItem = (j: JobCard): JobCardListItemDto => ({
  id: j.id,
  jobNumber: j.jobNumber,
  status: j.status,
  vehicle: {
    id: j.vehicle.id,
    registrationNumber: j.vehicle.registrationNumber,
    make: j.vehicle.make,
    model: j.vehicle.model,
  },
  customer: { id: j.customer.id, name: j.customer.name, phone: j.customer.phone },
  assignedMechanic: j.assignedMechanic
    ? { id: j.assignedMechanic.id, name: j.assignedMechanic.name }
    : null,
  promisedDeliveryAt: j.promisedDeliveryAt,
  isOverdue: isOverdue(j),
  createdAt: j.createdAt,
  updatedAt: j.updatedAt,
});

/**
 * UC-8/13/14/15(deliver). Every write locks the job row, validates against the §3.1
 * state machine, appends job_status_history and audits — all in one transaction.
 */
@Injectable()
export class JobCardsService {
  private readonly logger = new Logger(JobCardsService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(JobCard) private readonly jobRepo: Repository<JobCard>,
    @InjectRepository(JobStatusHistory) private readonly historyRepo: Repository<JobStatusHistory>,
    private readonly counterService: GarageCounterService,
    private readonly notificationsService: NotificationsService,
    private readonly linkService: CustomerLinkService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    user: IAuthUser,
    query: ListJobCardsQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<JobCardListItemDto>>> {
    const qb = this.jobRepo
      .createQueryBuilder('j')
      .innerJoinAndSelect('j.vehicle', 'v')
      .innerJoinAndSelect('j.customer', 'c')
      .leftJoinAndSelect('j.assignedMechanic', 'm')
      .where('j.garage_id = :garageId', { garageId: requireGarageId(user) });
    if (query.status?.length) qb.andWhere('j.status IN (:...statuses)', { statuses: query.status });
    if (query.openOnly || query.overdue) {
      qb.andWhere('j.status NOT IN (:...terminal)', { terminal: TERMINAL_JOB_STATUSES });
    }
    if (query.overdue) qb.andWhere('j.promised_delivery_at < now()');
    if (query.assignedToMe) qb.andWhere('j.assigned_mechanic_id = :me', { me: user.id });
    if (query.assignedMechanicId) {
      qb.andWhere('j.assigned_mechanic_id = :mechanicId', { mechanicId: query.assignedMechanicId });
    }
    if (query.vehicleId) qb.andWhere('j.vehicle_id = :vehicleId', { vehicleId: query.vehicleId });
    if (query.customerId)
      qb.andWhere('j.customer_id = :customerId', { customerId: query.customerId });
    if (query.search) {
      const registration = normalizeRegistrationNumber(query.search);
      qb.andWhere(
        `(j.job_number ILIKE :term OR c.name ILIKE :term OR c.phone ILIKE :term${
          registration ? ' OR v.registration_number LIKE :reg' : ''
        })`,
        { term: likeTerm(query.search), reg: likeTerm(registration) },
      );
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['j.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('JOB_CARD', this.i18n, lang),
      data: { items: rows.map(toListItem), total },
    };
  }

  async findOne(
    user: IAuthUser,
    jobCardId: string,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    return {
      message: SUCCESS.RECORD_FETCHED('JOB_CARD', this.i18n, lang),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** UC-8 — check-in. One transaction; the vehicle row lock serialises concurrent opens. */
  async create(
    user: IAuthUser,
    dto: CreateJobCardDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    const garageId = requireGarageId(user);
    let jobId: string;
    try {
      jobId = await this.dataSource.transaction(async (manager) => {
        const vehicle = await manager.getRepository(Vehicle).findOne({
          where: { id: dto.vehicleId, garageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!vehicle) throw apiError('NOT_FOUND');
        if (vehicle.status !== RecordStatus.ACTIVE) throw apiError('VEHICLE_INACTIVE');
        if (dto.checkinOdometerKm < vehicle.odometerKm) throw apiError('ODOMETER_DECREASED'); // AC-8.3
        const open = await manager.getRepository(JobCard).exist({
          where: { vehicleId: vehicle.id, status: Not(In([...TERMINAL_JOB_STATUSES])) },
        });
        if (open) throw apiError('OPEN_JOB_EXISTS'); // AC-8.2
        if (dto.assignedMechanicId) {
          await this.findAssignableMechanic(manager, garageId, dto.assignedMechanicId);
        }

        const garage = await manager
          .getRepository(Garage)
          .findOneOrFail({ where: { id: garageId } });
        const jobNumber = await this.counterService.next(
          manager,
          garageId,
          CounterType.JOB_CARD,
          garage.timezone,
        );
        const repo = manager.getRepository(JobCard);
        const job = await repo.save(
          repo.create({
            garageId,
            vehicleId: vehicle.id,
            customerId: vehicle.customerId, // owner snapshot at check-in
            jobNumber,
            status: JobCardStatus.CHECKED_IN,
            checkinOdometerKm: dto.checkinOdometerKm,
            fuelLevel: dto.fuelLevel ?? null,
            customerComplaints: dto.customerComplaints.trim(),
            promisedDeliveryAt: dto.promisedDeliveryAt ? new Date(dto.promisedDeliveryAt) : null,
            assignedMechanicId: dto.assignedMechanicId ?? null,
            openedById: user.id,
          }),
        );
        await manager.getRepository(JobStatusHistory).insert({
          jobCardId: job.id,
          fromStatus: null,
          toStatus: JobCardStatus.CHECKED_IN,
          changedById: user.id,
        });
        await manager
          .getRepository(Vehicle)
          .update({ id: vehicle.id }, { odometerKm: dto.checkinOdometerKm });
        await this.audit(manager, user, AUDIT_ACTIONS.JOB_OPENED, job.id, { after: { jobNumber } });
        await this.notifyOwner(manager, job, NotificationType.JOB_CHECKED_IN);
        return job.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, OPEN_JOB_UNIQUE)) throw apiError('OPEN_JOB_EXISTS');
      throw error;
    }
    return {
      message: SUCCESS.RECORD_CREATED('JOB_CARD', this.i18n, lang),
      data: await this.buildDetail(jobId, user),
    };
  }

  async update(
    user: IAuthUser,
    jobCardId: string,
    dto: UpdateJobCardDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      if (dto.fuelLevel !== undefined) job.fuelLevel = dto.fuelLevel;
      if (dto.customerComplaints !== undefined)
        job.customerComplaints = dto.customerComplaints.trim();
      if (dto.promisedDeliveryAt !== undefined)
        job.promisedDeliveryAt = new Date(dto.promisedDeliveryAt);
      await manager.getRepository(JobCard).save(job);
      await this.audit(manager, user, AUDIT_ACTIONS.JOB_UPDATED, jobCardId, {
        fields: Object.keys(dto),
      });
    });
    return {
      message: SUCCESS.RECORD_UPDATED('JOB_CARD', this.i18n, lang),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** UC-13. Mechanic: assigned-mechanic + only IN_PROGRESS → QUALITY_CHECK (AC-13.3). */
  async changeStatus(
    user: IAuthUser,
    jobCardId: string,
    dto: ChangeJobStatusDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      assertAssignedIfMechanic(user, job);
      assertManualTransition(job.status, dto.status, user.role);
      if (dto.status === JobCardStatus.IN_PROGRESS) await this.assertApprovedEstimate(manager, job);
      const from = job.status;
      await applyStatusChange(manager, job, dto.status, user.id, dto.note ?? null);
      await this.audit(manager, user, AUDIT_ACTIONS.JOB_STATUS_CHANGED, jobCardId, {
        before: { status: from },
        after: { status: dto.status },
      });
      if (dto.status === JobCardStatus.READY_FOR_PICKUP) {
        await this.notifyOwner(manager, job, NotificationType.READY_FOR_PICKUP); // AC-13.4
      }
    });
    return {
      message: SUCCESS.STATUS_CHANGED(this.i18n, lang, { status: dto.status }),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** UC-14 / AC-14.2: other-garage user → 404; same garage but not an active mechanic → 400. */
  async assignMechanic(
    user: IAuthUser,
    jobCardId: string,
    dto: AssignMechanicDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      if (dto.mechanicId) await this.findAssignableMechanic(manager, garageId, dto.mechanicId);
      const before = job.assignedMechanicId;
      job.assignedMechanicId = dto.mechanicId;
      await manager.getRepository(JobCard).save(job);
      await this.audit(manager, user, AUDIT_ACTIONS.JOB_ASSIGNED, jobCardId, {
        before: { assignedMechanicId: before },
        after: { assignedMechanicId: dto.mechanicId },
      });
    });
    return {
      message: SUCCESS.RECORD_UPDATED('JOB_CARD', this.i18n, lang),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** Any open job without an invoice → CANCELLED; owner links stop working. */
  async cancel(
    user: IAuthUser,
    jobCardId: string,
    dto: CancelJobCardDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      if (await manager.getRepository(Invoice).exist({ where: { jobCardId } })) {
        throw apiError('INVOICE_EXISTS');
      }
      assertSystemTransition(job.status, JobCardStatus.CANCELLED);
      job.cancellationReason = dto.reason.trim();
      await applyStatusChange(
        manager,
        job,
        JobCardStatus.CANCELLED,
        user.id,
        job.cancellationReason,
      );
      await manager
        .getRepository(Estimate)
        .update({ jobCardId, status: EstimateStatus.SENT }, { status: EstimateStatus.EXPIRED });
      await this.linkService.revokeForJob(jobCardId, manager);
      await this.audit(manager, user, AUDIT_ACTIONS.JOB_CANCELLED, jobCardId, {
        reason: dto.reason,
      });
    });
    return {
      message: SUCCESS.STATUS_CHANGED(this.i18n, lang, { status: JobCardStatus.CANCELLED }),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** UC-15 step 4 / AC-15.4: hand-back requires a PAID invoice. */
  async deliver(
    user: IAuthUser,
    jobCardId: string,
    dto: DeliverJobCardDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    await this.handOver(user, jobCardId, dto.nextServiceDate, dto.note ?? null, false);
    return {
      message: SUCCESS.STATUS_CHANGED(this.i18n, lang, { status: JobCardStatus.DELIVERED }),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  /** UC-15 4a: GARAGE_ADMIN (section DELIVER_ON_CREDIT) may hand back with a balance due. */
  async deliverOnCredit(
    user: IAuthUser,
    jobCardId: string,
    dto: DeliverOnCreditDto,
    lang: string,
  ): Promise<IServiceResult<JobCardDetailDto>> {
    await this.handOver(user, jobCardId, dto.nextServiceDate, dto.note.trim(), true);
    return {
      message: SUCCESS.STATUS_CHANGED(this.i18n, lang, { status: JobCardStatus.DELIVERED }),
      data: await this.buildDetail(jobCardId, user),
    };
  }

  async statusHistory(
    user: IAuthUser,
    jobCardId: string,
    lang: string,
  ): Promise<IServiceResult<JobStatusHistoryDto[]>> {
    await findJobInGarage(this.dataSource.manager, requireGarageId(user), jobCardId);
    const rows = await this.historyRepo.find({
      where: { jobCardId },
      relations: { changedBy: true },
      order: { createdAt: 'ASC' },
    });
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('JOB_CARD', this.i18n, lang),
      data: rows.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: h.changedBy ? { id: h.changedBy.id, name: h.changedBy.name } : null,
        note: h.note,
        createdAt: h.createdAt,
      })),
    };
  }

  private async handOver(
    user: IAuthUser,
    jobCardId: string,
    nextServiceDate: string | undefined,
    note: string | null,
    onCredit: boolean,
  ): Promise<void> {
    const garageId = requireGarageId(user);
    await this.dataSource.transaction(async (manager) => {
      const job = await findJobInGarage(manager, garageId, jobCardId, true);
      assertNotClosed(job);
      assertSystemTransition(job.status, JobCardStatus.DELIVERED);
      const invoice = await manager.getRepository(Invoice).findOne({ where: { jobCardId } });
      if (!invoice) throw apiError(onCredit ? 'INVOICE_REQUIRED' : 'INVOICE_NOT_PAID');
      const paid = invoice.status === InvoiceStatus.PAID;
      if (!onCredit && !paid) throw apiError('INVOICE_NOT_PAID');
      job.deliveredOnCredit = onCredit && !paid;
      await applyStatusChange(manager, job, JobCardStatus.DELIVERED, user.id, note);
      if (nextServiceDate) {
        await manager.getRepository(Vehicle).update({ id: job.vehicleId }, { nextServiceDate });
      }
      await this.linkService.revokeForJob(jobCardId, manager);
      await this.audit(
        manager,
        user,
        onCredit ? AUDIT_ACTIONS.JOB_DELIVERED_ON_CREDIT : AUDIT_ACTIONS.JOB_DELIVERED,
        jobCardId,
        {
          invoiceStatus: invoice.status,
          balanceDue: formatMinor(parseMinor(invoice.total) - parseMinor(invoice.amountPaid)),
          note,
        },
      );
    });
  }

  /** IN_PROGRESS needs the latest answered estimate to be (partially) approved. */
  private async assertApprovedEstimate(manager: EntityManager, job: JobCard): Promise<void> {
    const latest = await manager.getRepository(Estimate).findOne({
      where: {
        jobCardId: job.id,
        status: Not(In([EstimateStatus.DRAFT, EstimateStatus.SUPERSEDED])),
      },
      order: { version: 'DESC' },
    });
    if (!latest || !APPROVED_ESTIMATES.includes(latest.status))
      throw apiError('ESTIMATE_NOT_APPROVED');
  }

  private async findAssignableMechanic(
    manager: EntityManager,
    garageId: string,
    mechanicId: string,
  ): Promise<User> {
    const candidate = await manager.getRepository(User).findOne({ where: { id: mechanicId } });
    if (!candidate || candidate.garageId !== garageId) throw apiError('NOT_FOUND');
    if (candidate.role !== UserRole.MECHANIC || candidate.status !== RecordStatus.ACTIVE) {
      throw apiError('INVALID_MECHANIC');
    }
    return candidate;
  }

  /** Owner notification with a fresh VIEW_JOB link; channels = customer preference. */
  private async notifyOwner(
    manager: EntityManager,
    job: JobCard,
    type: NotificationType,
  ): Promise<void> {
    const link = await this.linkService.create(
      { garageId: job.garageId, jobCardId: job.id, purpose: LinkPurpose.VIEW_JOB },
      manager,
    );
    await this.notificationsService.enqueue(
      {
        garageId: job.garageId,
        type,
        customerId: job.customerId,
        jobCardId: job.id,
        linkUrl: link.url,
      },
      manager,
    );
  }

  private async buildDetail(jobCardId: string, user: IAuthUser): Promise<JobCardDetailDto> {
    const job = await this.jobRepo.findOneOrFail({
      where: { id: jobCardId },
      relations: { vehicle: true, customer: true, assignedMechanic: true, openedBy: true },
    });
    const manager = this.dataSource.manager;
    const [problemCount, latestEstimate, invoice] = await Promise.all([
      manager.getRepository(Problem).count({ where: { jobCardId } }),
      manager.getRepository(Estimate).findOne({ where: { jobCardId }, order: { version: 'DESC' } }),
      manager.getRepository(Invoice).findOne({ where: { jobCardId } }),
    ]);
    const mechanicBlocked = user.role === UserRole.MECHANIC && job.assignedMechanicId !== user.id;
    return {
      ...toListItem(job),
      checkinOdometerKm: job.checkinOdometerKm,
      fuelLevel: job.fuelLevel,
      customerComplaints: job.customerComplaints,
      openedBy: { id: job.openedBy.id, name: job.openedBy.name },
      closedAt: job.closedAt,
      deliveredOnCredit: job.deliveredOnCredit,
      cancellationReason: job.cancellationReason,
      problemCount,
      latestEstimate: latestEstimate
        ? {
            id: latestEstimate.id,
            version: latestEstimate.version,
            status: latestEstimate.status,
            total: latestEstimate.total,
            approvedTotal: latestEstimate.approvedTotal,
          }
        : null,
      invoice: invoice
        ? {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            total: invoice.total,
            amountPaid: invoice.amountPaid,
            balanceDue: formatMinor(parseMinor(invoice.total) - parseMinor(invoice.amountPaid)),
          }
        : null,
      allowedTransitions:
        mechanicBlocked || isTerminal(job.status) ? [] : manualTargets(job.status, user.role),
    };
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    jobCardId: string,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'job_card',
        entityId: jobCardId,
        changes,
      },
      manager,
    );
  }
}
