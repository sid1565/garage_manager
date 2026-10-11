import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { CounterType } from '../enums/counter-type.enum';
import { Garage } from './garage.entity';

/**
 * Per-garage, per-year sequence for human-readable numbers (A-6).
 * Services lock the row (SELECT … FOR UPDATE) inside the creating transaction,
 * so concurrent job openings get distinct, gap-free numbers (AC-8.4).
 */
@Entity('garage_counters')
@Index('UQ_garage_counters_garage_type_period', ['garageId', 'counterType', 'period'], {
  unique: true,
})
export class GarageCounter extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'enum', enum: CounterType, enumName: 'counter_type' })
  counterType: CounterType;

  /** Calendar year the sequence belongs to, e.g. 2026 → JOB-2026-000123. */
  @Column({ type: 'smallint' })
  period: number;

  @Column({ type: 'integer', default: 0 })
  lastValue: number;
}
