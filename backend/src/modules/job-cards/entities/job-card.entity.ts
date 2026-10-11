import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { User } from '../../staff/entities/user.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { FuelLevel } from '../enums/fuel-level.enum';
import { JobCardStatus } from '../enums/job-card-status.enum';

/** ENT-5 — one repair visit of a vehicle. Never hard-deleted (NFR-11). */
@Entity('job_cards')
@Index('UQ_job_cards_garage_job_number', ['garageId', 'jobNumber'], { unique: true })
// At most one non-terminal job per vehicle (AC-8.2) — enforced by the database, not just the service.
@Index('UQ_job_cards_open_per_vehicle', ['vehicleId'], {
  unique: true,
  where: `"status" NOT IN ('DELIVERED', 'CANCELLED')`,
})
@Index('IDX_job_cards_garage_status_created', ['garageId', 'status', 'createdAt'])
@Index('IDX_job_cards_vehicle_created', ['vehicleId', 'createdAt'])
@Index('IDX_job_cards_garage_mechanic_open', ['garageId', 'assignedMechanicId'], {
  where: `"status" NOT IN ('DELIVERED', 'CANCELLED')`,
})
@Index('IDX_job_cards_garage_promised_open', ['garageId', 'promisedDeliveryAt'], {
  where: `"status" NOT IN ('DELIVERED', 'CANCELLED')`,
})
@Check('CHK_job_cards_checkin_odometer_non_negative', `"checkin_odometer_km" >= 0`)
export class JobCard extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'uuid' })
  vehicleId: string;

  @ManyToOne(() => Vehicle, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle;

  /** Owner at check-in time — history stays correct after a vehicle transfer. */
  @Column({ type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  /** e.g. JOB-2026-000123, from garage_counters. */
  @Column({ type: 'varchar', length: 20 })
  jobNumber: string;

  @Column({
    type: 'enum',
    enum: JobCardStatus,
    enumName: 'job_card_status',
    default: JobCardStatus.CHECKED_IN,
  })
  status: JobCardStatus;

  @Column({ type: 'integer' })
  checkinOdometerKm: number;

  @Column({ type: 'enum', enum: FuelLevel, enumName: 'fuel_level', nullable: true })
  fuelLevel: FuelLevel | null;

  @Column({ type: 'text' })
  customerComplaints: string;

  @Column({ type: 'timestamptz', nullable: true })
  promisedDeliveryAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  assignedMechanicId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assigned_mechanic_id' })
  assignedMechanic: User | null;

  @Column({ type: 'uuid' })
  openedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'opened_by_id' })
  openedBy: User;

  /** Set when the job reaches DELIVERED or CANCELLED. */
  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** UC-15 4a — delivered by a GARAGE_ADMIN with an unpaid balance. */
  @Column({ type: 'boolean', default: false })
  deliveredOnCredit: boolean;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;
}
