import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GarageCounter } from '../entities/garage-counter.entity';
import { CounterType } from '../enums/counter-type.enum';

const PREFIX = new Map<CounterType, string>([
  [CounterType.JOB_CARD, 'JOB'],
  [CounterType.INVOICE, 'INV'],
]);

/** Calendar year "now" in the garage's timezone. */
export const yearInTimezone = (timezone: string, at = new Date()): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric' }).format(at));

/**
 * Gap-free human numbers per garage and year (A-6): JOB-2026-000123, INV-2026-000045.
 * MUST be called inside the creating transaction: the UPDATE row-locks the counter until
 * commit, so concurrent check-ins in one garage get distinct numbers (AC-8.4), and a
 * rolled-back transaction gives its number back.
 */
@Injectable()
export class GarageCounterService {
  async next(
    manager: EntityManager,
    garageId: string,
    counterType: CounterType,
    timezone: string,
  ): Promise<string> {
    const period = yearInTimezone(timezone);
    await manager
      .createQueryBuilder()
      .insert()
      .into(GarageCounter)
      .values({ garageId, counterType, period, lastValue: 0 })
      .orIgnore()
      .execute();
    const result = await manager
      .createQueryBuilder()
      .update(GarageCounter)
      .set({ lastValue: () => 'last_value + 1' })
      .where('garage_id = :garageId AND counter_type = :counterType AND period = :period', {
        garageId,
        counterType,
        period,
      })
      .returning('last_value')
      .execute();
    const value = (result.raw as { last_value: number }[])[0].last_value;
    return `${PREFIX.get(counterType)}-${period}-${String(value).padStart(6, '0')}`;
  }
}
