import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { RecordStatus } from '../../../common/enums';
import { Customer } from '../../customers/entities/customer.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { FuelType } from '../enums/fuel-type.enum';

/** ENT-4. */
@Entity('vehicles')
@Index('UQ_vehicles_garage_registration', ['garageId', 'registrationNumber'], { unique: true })
@Index('IDX_vehicles_garage_customer', ['garageId', 'customerId'])
@Index('IDX_vehicles_next_service_active', ['nextServiceDate'], {
  where: `"status" = 'ACTIVE' AND "next_service_date" IS NOT NULL`,
})
// GIN trigram index for partial registration-number search (UC-6); created in the migration.
@Index('IDX_vehicles_registration_trgm', { synchronize: false })
@Check('CHK_vehicles_odometer_non_negative', `"odometer_km" >= 0`)
export class Vehicle extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  /** Current owner; changes on transfer (UC-7). Job cards keep their own snapshot. */
  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  /** Normalised: uppercase, alphanumeric only (AC-5.1). */
  @Column({ type: 'varchar', length: 20 })
  registrationNumber: string;

  @Column({ type: 'varchar', length: 17, nullable: true })
  vin: string | null;

  @Column({ type: 'varchar', length: 60 })
  make: string;

  @Column({ type: 'varchar', length: 60 })
  model: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  variant: string | null;

  @Column({ type: 'smallint', nullable: true })
  manufactureYear: number | null;

  @Column({ type: 'enum', enum: FuelType, enumName: 'fuel_type' })
  fuelType: FuelType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  color: string | null;

  /** Last recorded odometer; check-in may not go below it (AC-8.3). */
  @Column({ type: 'integer', default: 0 })
  odometerKm: number;

  @Column({ type: 'date', nullable: true })
  nextServiceDate: string | null;

  /** Service date the last reminder was sent for — de-duplicates UC-18 (AC-18.1). */
  @Column({ type: 'date', nullable: true })
  lastReminderSentFor: string | null;

  @Column({
    type: 'enum',
    enum: RecordStatus,
    enumName: 'record_status',
    default: RecordStatus.ACTIVE,
  })
  status: RecordStatus;
}
