import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { User } from '../../staff/entities/user.entity';
import { JobCard } from './job-card.entity';
import { Problem } from './problem.entity';

/** ENT-7 — photo / PDF evidence. The file itself lives in storage (NFR-8). */
@Entity('attachments')
@Index('IDX_attachments_job_card', ['jobCardId'])
@Index('IDX_attachments_problem', ['problemId'])
@Check('CHK_attachments_size', `"size_bytes" > 0 AND "size_bytes" <= 5242880`)
export class Attachment extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  @Column({ type: 'uuid', nullable: true })
  problemId: string | null;

  @ManyToOne(() => Problem, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'problem_id' })
  problem: Problem | null;

  /** Opaque key in the storage driver (local path or S3 object key). */
  @Column({ type: 'varchar', length: 500 })
  storageKey: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  caption: string | null;

  @Column({ type: 'uuid' })
  uploadedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User;
}
