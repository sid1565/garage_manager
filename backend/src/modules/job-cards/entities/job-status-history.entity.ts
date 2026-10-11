import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { User } from '../../staff/entities/user.entity';
import { JobCardStatus } from '../enums/job-card-status.enum';
import { JobCard } from './job-card.entity';

/** ENT-10 — append-only status trail. */
@Entity('job_status_history')
@Index('IDX_job_status_history_job_created', ['jobCardId', 'createdAt'])
export class JobStatusHistory extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  /** null for the initial CHECKED_IN row. */
  @Column({ type: 'enum', enum: JobCardStatus, enumName: 'job_card_status', nullable: true })
  fromStatus: JobCardStatus | null;

  @Column({ type: 'enum', enum: JobCardStatus, enumName: 'job_card_status' })
  toStatus: JobCardStatus;

  /** null when the system changed the status (e.g. customer approval via link). */
  @Column({ type: 'uuid', nullable: true })
  changedById: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'changed_by_id' })
  changedBy: User | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
