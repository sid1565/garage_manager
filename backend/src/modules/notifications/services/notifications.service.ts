import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { NotificationChannel } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { CustomerLinkService } from '../../customer-links/services/customer-link.service';
import { Customer } from '../../customers/entities/customer.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { Problem } from '../../job-cards/entities/problem.entity';
import { isTerminal } from '../../job-cards/utils/job-status.machine';
import { User } from '../../staff/entities/user.entity';
import {
  ListNotificationsQueryDto,
  NotificationDto,
  NotifyOwnerDto,
  NotifyOwnerResultDto,
} from '../dto/notification.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';
import { IEnqueueNotificationInput } from '../interfaces/enqueue-notification.interface';

const ORDER_COLUMNS = new Map([['createdAt', 'n.createdAt']]);
/** Customer messages are rendered in the garage's default locale (v1: en). */
const MESSAGE_LOCALE = 'en';
const PORTAL_TOKEN = /\/portal\/[A-Za-z0-9_-]{43}/g;

/** Staff can read the log, but link tokens inside message bodies are never echoed back. */
const maskTokens = (body: string): string => body.replace(PORTAL_TOKEN, '/portal/•••');

export const toNotificationDto = (
  n: Notification,
  sender: Pick<User, 'id' | 'name'> | null,
): NotificationDto => ({
  id: n.id,
  jobCardId: n.jobCardId,
  customerId: n.customerId,
  type: n.type,
  channel: n.channel,
  recipient: n.recipient,
  subject: n.subject,
  body: maskTokens(n.body),
  status: n.status,
  attempts: n.attempts,
  lastError: n.lastError,
  sentAt: n.sentAt,
  createdBy: sender ? { id: sender.id, name: sender.name } : null,
  createdAt: n.createdAt,
});

/**
 * UC-10/16 + the internal queue API. APIs only INSERT QUEUED rows (inside the caller's
 * transaction); NotificationsWorker delivers them asynchronously (NFR-2, AC-10.4).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    private readonly linkService: CustomerLinkService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    user: IAuthUser,
    query: ListNotificationsQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<NotificationDto>>> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.createdBy', 'u')
      .where('n.garage_id = :garageId', { garageId: requireGarageId(user) });
    if (query.jobCardId) qb.andWhere('n.job_card_id = :jobCardId', { jobCardId: query.jobCardId });
    if (query.customerId)
      qb.andWhere('n.customer_id = :customerId', { customerId: query.customerId });
    if (query.status) qb.andWhere('n.status = :status', { status: query.status });
    if (query.channel) qb.andWhere('n.channel = :channel', { channel: query.channel });
    if (query.type) qb.andWhere('n.type = :type', { type: query.type });
    if (query.search) qb.andWhere('n.recipient ILIKE :term', { term: likeTerm(query.search) });
    applyOrder(qb, query.order, ORDER_COLUMNS, ['n.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('NOTIFICATION', this.i18n, lang),
      data: { items: rows.map((n) => toNotificationDto(n, n.createdBy)), total },
    };
  }

  /** UC-10: VIEW_JOB link + one QUEUED message per channel, all in one transaction. */
  async notifyOwner(
    user: IAuthUser,
    jobCardId: string,
    dto: NotifyOwnerDto,
    lang: string,
  ): Promise<IServiceResult<NotifyOwnerResultDto>> {
    const garageId = requireGarageId(user);
    const result = await this.dataSource.transaction(async (manager) => {
      const job = await manager
        .getRepository(JobCard)
        .findOne({ where: { id: jobCardId, garageId } });
      if (!job) throw apiError('NOT_FOUND'); // AC-10.5: other garage → 404
      if (isTerminal(job.status)) throw apiError('JOB_CLOSED');

      const templateData: Record<string, string> = {};
      if (dto.type === NotificationType.PROBLEMS_FOUND) {
        const problems = await manager
          .getRepository(Problem)
          .find({ where: { jobCardId }, order: { createdAt: 'ASC' } });
        if (problems.length === 0) throw apiError('NO_PROBLEMS_RECORDED'); // AC-10.2
        templateData.problemCount = String(problems.length);
        templateData.problemSummary = problems
          .map((p) => `${p.title} (${p.severity})`)
          .join('; ')
          .slice(0, 400);
      }

      const link = await this.linkService.create(
        { garageId, jobCardId, purpose: LinkPurpose.VIEW_JOB },
        manager,
      );
      const rows = await this.enqueue(
        {
          garageId,
          type: dto.type,
          channels: dto.channels,
          customerId: job.customerId,
          jobCardId,
          linkUrl: link.url,
          message: dto.message,
          templateData,
          createdById: user.id,
        },
        manager,
      );
      if (rows.length === 0) throw apiError('NO_CONTACT_FOR_CHANNEL');
      await this.auditService.record(
        {
          garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.NOTIFICATION_SENT_MANUALLY,
          entityType: 'job_card',
          entityId: jobCardId,
          changes: { type: dto.type, channels: rows.map((r) => r.channel) },
        },
        manager,
      );
      const sender = await manager.getRepository(User).findOneOrFail({ where: { id: user.id } });
      return {
        notifications: rows.map((n) => toNotificationDto(n, sender)),
        linkExpiresAt: link.link.expiresAt,
      };
    });
    return { message: SUCCESS.NOTIFICATION_QUEUED(this.i18n, lang), data: result };
  }

  /** UC-16 / AC-16.1: only FAILED can be retried. */
  async retry(
    user: IAuthUser,
    notificationId: string,
    lang: string,
  ): Promise<IServiceResult<NotificationDto>> {
    const garageId = requireGarageId(user);
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);
      const notification = await repo.findOne({
        where: { id: notificationId, garageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!notification) throw apiError('NOT_FOUND');
      if (notification.status !== NotificationStatus.FAILED) throw apiError('NOT_FAILED');
      notification.status = NotificationStatus.QUEUED;
      notification.attempts = 0;
      notification.nextAttemptAt = new Date();
      notification.lastError = null;
      const result = await repo.save(notification);
      await this.auditService.record(
        {
          garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.NOTIFICATION_RETRIED,
          entityType: 'notification',
          entityId: notificationId,
        },
        manager,
      );
      return result;
    });
    const withSender = await this.notificationRepo.findOneOrFail({
      where: { id: saved.id },
      relations: { createdBy: true },
    });
    return {
      message: SUCCESS.NOTIFICATION_QUEUED(this.i18n, lang),
      data: toNotificationDto(withSender, withSender.createdBy),
    };
  }

  /**
   * Internal queue API. Explicit `channels` are strict (missing contact → 400
   * NO_CONTACT_FOR_CHANNEL); default channels (customer preference) skip silently so an
   * automatic event never fails the business transaction that triggered it.
   */
  async enqueue(
    input: IEnqueueNotificationInput,
    manager?: EntityManager,
  ): Promise<Notification[]> {
    const em = manager ?? this.dataSource.manager;
    const garage = await em.getRepository(Garage).findOneOrFail({ where: { id: input.garageId } });
    const customer = input.customerId
      ? await em
          .getRepository(Customer)
          .findOne({ where: { id: input.customerId, garageId: garage.id } })
      : null;
    const job = input.jobCardId
      ? await em.getRepository(JobCard).findOne({
          where: { id: input.jobCardId, garageId: garage.id },
          relations: { vehicle: true },
        })
      : null;

    const strict = input.channels !== undefined;
    const channels =
      input.channels ??
      (input.recipientEmail ? [NotificationChannel.EMAIL] : (customer?.preferredChannels ?? []));
    const args: Record<string, string> = {
      garageName: garage.name,
      garagePhone: garage.phone,
      currency: garage.currency,
      customerName: customer?.name ?? '',
      registration: job?.vehicle.registrationNumber ?? '',
      jobNumber: job?.jobNumber ?? '',
      link: input.linkUrl ?? '',
      ...input.templateData,
    };
    const subject = this.render(`NOTIFICATION.${input.type}.SUBJECT`, args);
    const note = input.message
      ? `\n\n${this.render('NOTIFICATION.PERSONAL_NOTE', { message: input.message })}`
      : '';
    const body = `${this.render(`NOTIFICATION.${input.type}.BODY`, args)}${note}`;

    const repo = em.getRepository(Notification);
    const rows: Notification[] = [];
    for (const channel of channels) {
      const recipient =
        channel === NotificationChannel.EMAIL
          ? (input.recipientEmail ?? customer?.email)
          : customer?.phone;
      if (!recipient) {
        if (strict) throw apiError('NO_CONTACT_FOR_CHANNEL');
        this.logger.warn(
          `Skipping ${input.type} via ${channel}: no recipient (garage ${garage.id})`,
        );
        continue;
      }
      rows.push(
        repo.create({
          garageId: garage.id,
          customerId: customer?.id ?? null,
          jobCardId: input.jobCardId ?? null,
          type: input.type,
          channel,
          recipient,
          subject: channel === NotificationChannel.EMAIL ? subject : null,
          body,
          createdById: input.createdById ?? null,
        }),
      );
    }
    return rows.length ? repo.save(rows) : [];
  }

  private render(key: string, args: Record<string, string>): string {
    return this.i18n.t(`translation.${key}`, { lang: MESSAGE_LOCALE, args }) as string;
  }
}
