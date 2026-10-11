import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RecordStatus } from '../../../common/enums';
import { Garage } from '../../garages/entities/garage.entity';
import { GarageStatus } from '../../garages/enums/garage-status.enum';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

const REMINDER_HOUR = 9;
const LOOKAHEAD_DAYS = 7;

/** "YYYY-MM-DD" for `at` in `timezone`. */
const localDate = (timezone: string, at: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

const localHour = (timezone: string, at: Date): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(
      at,
    ),
  );

const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * UC-18: one SERVICE_REMINDER per vehicle per service date, sent at 09:00 garage-local
 * time when the next service date is within the coming week. De-duplication is an atomic
 * conditional UPDATE of `last_reminder_sent_for`, so overlapping runs can't double-send
 * (AC-18.1).
 */
@Injectable()
export class ServiceReminderService {
  private readonly logger = new Logger(ServiceReminderService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourlySweep(): Promise<void> {
    if (!this.config.get<boolean>('notifications.workerEnabled', true)) return;
    const sent = await this.sendDueReminders(new Date());
    if (sent > 0) this.logger.log(`Queued ${sent} service reminder(s)`);
  }

  /** `ignoreHour` lets tests and manual runs bypass the 09:00 window. */
  async sendDueReminders(
    now: Date,
    options: { ignoreHour?: boolean; garageId?: string } = {},
  ): Promise<number> {
    const garages = await this.dataSource.getRepository(Garage).find({
      where: { status: GarageStatus.ACTIVE, ...(options.garageId ? { id: options.garageId } : {}) },
    });
    let queued = 0;
    for (const garage of garages) {
      if (!options.ignoreHour && localHour(garage.timezone, now) !== REMINDER_HOUR) continue;
      const today = localDate(garage.timezone, now);
      const due = await this.dataSource
        .getRepository(Vehicle)
        .createQueryBuilder('v')
        .innerJoin('v.customer', 'c', 'c.status = :active', { active: RecordStatus.ACTIVE })
        .where('v.garage_id = :garageId AND v.status = :active', { garageId: garage.id })
        .andWhere('v.next_service_date BETWEEN :today AND :horizon', {
          today,
          horizon: addDays(today, LOOKAHEAD_DAYS),
        })
        .andWhere('v.last_reminder_sent_for IS DISTINCT FROM v.next_service_date')
        .getMany();
      for (const vehicle of due) {
        if (await this.remind(garage, vehicle)) queued += 1;
      }
    }
    return queued;
  }

  private async remind(garage: Garage, vehicle: Vehicle): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const claimed = await manager
        .createQueryBuilder()
        .update(Vehicle)
        .set({ lastReminderSentFor: () => 'next_service_date' })
        .where('id = :id AND last_reminder_sent_for IS DISTINCT FROM next_service_date', {
          id: vehicle.id,
        })
        .execute();
      if (!claimed.affected) return false; // another run got here first
      await this.notificationsService.enqueue(
        {
          garageId: garage.id,
          type: NotificationType.SERVICE_REMINDER,
          customerId: vehicle.customerId,
          templateData: {
            registration: vehicle.registrationNumber,
            serviceDate: vehicle.nextServiceDate ?? '',
          },
        },
        manager,
      );
      return true;
    });
  }
}
