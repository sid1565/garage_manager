import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { NotificationChannel, RecordStatus } from '../../../common/enums';
import { Garage } from '../../garages/entities/garage.entity';

/** ENT-3 — vehicle owner. No login in v1 (A-2). */
@Entity('customers')
@Index('UQ_customers_garage_phone', ['garageId', 'phone'], { unique: true })
@Index('IDX_customers_garage_status_created', ['garageId', 'status', 'createdAt'])
// GIN trigram index for ILIKE name search (UC-6); created by hand in the migration.
@Index('IDX_customers_name_trgm', { synchronize: false })
export class Customer extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** E.164, normalised by the service (e.g. +919876543210). Unique per garage (AC-4.2). */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel',
    array: true,
  })
  preferredChannels: NotificationChannel[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: RecordStatus,
    enumName: 'record_status',
    default: RecordStatus.ACTIVE,
  })
  status: RecordStatus;
}
