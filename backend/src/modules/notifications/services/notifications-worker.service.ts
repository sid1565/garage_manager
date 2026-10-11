import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { NotificationChannel } from '../../../common/enums';
import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import {
  EMAIL_PROVIDER,
  INotificationProvider,
  SMS_PROVIDER,
} from '../providers/notification-provider.interface';

export const MAX_DELIVERY_ATTEMPTS = 3;
/** Delay before attempt 2 and attempt 3 (AC-10.3: 3 attempts, then FAILED). */
const BACKOFF_MS = [60_000, 5 * 60_000];
const BATCH_SIZE = 20;
const STUCK_AFTER_MS = 5 * 60_000;
const INTERVAL_NAME = 'notifications-worker';

/**
 * Delivers QUEUED notifications (A-4: Postgres is the queue). Each batch is claimed with
 * SELECT … FOR UPDATE SKIP LOCKED and flipped to SENDING in a short transaction, so any
 * number of API instances can run the worker without double-sending. Provider calls
 * happen outside that transaction.
 */
@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsWorker.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: INotificationProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: INotificationProvider,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('notifications.workerEnabled', true)) return;
    const pollMs = this.config.get<number>('notifications.pollMs', 5000);
    this.scheduler.addInterval(
      INTERVAL_NAME,
      setInterval(() => void this.tick(), pollMs),
    );
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('interval', INTERVAL_NAME))
      this.scheduler.deleteInterval(INTERVAL_NAME);
  }

  /** Claims and delivers one batch. Returns how many were attempted (used by tests). */
  async processDueBatch(): Promise<number> {
    const ids = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);
      const due = await repo
        .createQueryBuilder('n')
        .select('n.id')
        .where('n.status = :queued AND n.next_attempt_at <= now()', {
          queued: NotificationStatus.QUEUED,
        })
        .orderBy('n.next_attempt_at', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      if (due.length === 0) return [];
      const claimed = due.map((n) => n.id);
      await repo.update(
        { id: In(claimed) },
        { status: NotificationStatus.SENDING, attempts: () => 'attempts + 1' },
      );
      return claimed;
    });
    for (const id of ids) await this.deliver(id);
    return ids.length;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // never overlap batches in one process
    this.running = true;
    try {
      await this.recoverStuck();
      await this.processDueBatch();
    } catch (error) {
      this.logger.error(`Notification batch failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(id: string): Promise<void> {
    const repo = this.dataSource.getRepository(Notification);
    const n = await repo.findOneOrFail({ where: { id } });
    const provider =
      n.channel === NotificationChannel.EMAIL ? this.emailProvider : this.smsProvider;
    try {
      const result = await provider.send({
        recipient: n.recipient,
        subject: n.subject,
        body: n.body,
      });
      await repo.update(
        { id },
        {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastError: null,
        },
      );
    } catch (error) {
      const exhausted = n.attempts >= MAX_DELIVERY_ATTEMPTS;
      const delay = BACKOFF_MS.at(n.attempts - 1) ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await repo.update(
        { id },
        {
          status: exhausted ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
          lastError: String((error as Error).message ?? error).slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + delay),
        },
      );
      this.logger.warn(
        `Notification ${id} attempt ${n.attempts} failed${exhausted ? ' — giving up' : ''}`,
      );
    }
  }

  /** A crash between claim and update leaves rows SENDING forever; put them back. */
  private async recoverStuck(): Promise<void> {
    await this.dataSource
      .getRepository(Notification)
      .createQueryBuilder()
      .update()
      .set({ status: NotificationStatus.QUEUED })
      .where('status = :sending AND updated_at < :cutoff', {
        sending: NotificationStatus.SENDING,
        cutoff: new Date(Date.now() - STUCK_AFTER_MS),
      })
      .execute();
  }
}
