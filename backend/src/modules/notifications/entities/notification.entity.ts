import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { NotificationChannel } from '../../../common/enums';
import { Customer } from '../../customers/entities/customer.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { User } from '../../staff/entities/user.entity';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * ENT-11 — one message on one channel. Doubles as the Postgres-backed send
 * queue (A-4): the worker claims QUEUED rows whose next_attempt_at has passed
 * using SELECT … FOR UPDATE SKIP LOCKED.
 */
@Entity('notifications')
@Index('IDX_notifications_queue', ['nextAttemptAt'], { where: `"status" = 'QUEUED'` })
@Index('IDX_notifications_garage_job_created', ['garageId', 'jobCardId', 'createdAt'])
@Index('IDX_notifications_garage_customer_created', ['garageId', 'customerId', 'createdAt'])
@Index('IDX_notifications_garage_status_created', ['garageId', 'status', 'createdAt'])
export class Notification extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  /** Set for owner messages; null for staff messages (STAFF_WELCOME). */
  @Column({ type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ type: 'uuid', nullable: true })
  jobCardId: string | null;

  @ManyToOne(() => JobCard, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard | null;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel, enumName: 'notification_channel' })
  channel: NotificationChannel;

  /** Email address or E.164 phone, captured at send time. */
  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject: string | null;

  /** Fully rendered content — what the owner actually received. */
  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    enumName: 'notification_status',
    default: NotificationStatus.QUEUED,
  })
  status: NotificationStatus;

  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt: Date;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** Staff member who triggered it; null for system/event notifications. */
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;
}
