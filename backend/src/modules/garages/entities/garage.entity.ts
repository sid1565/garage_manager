import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { decimalTransformer } from '../../../common/utils/money.util';
import { GarageStatus } from '../enums/garage-status.enum';

/** ENT-1 — the tenant. Every garage-scoped row references a garage. */
@Entity('garages')
export class Garage extends AppBaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  taxRegistrationNumber: string | null;

  /** ISO 4217 code (A-7). */
  @Column({ type: 'char', length: 3, default: 'INR' })
  currency: string;

  /** Flat tax percentage applied to estimates and invoices (A-5), e.g. "18.00". */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxRate: string;

  /** IANA timezone used for reminders and "today" on the dashboard (OQ-6). */
  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({
    type: 'enum',
    enum: GarageStatus,
    enumName: 'garage_status',
    default: GarageStatus.ACTIVE,
  })
  status: GarageStatus;
}
