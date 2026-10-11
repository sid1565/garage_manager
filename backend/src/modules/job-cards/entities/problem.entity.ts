import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { User } from '../../staff/entities/user.entity';
import { ProblemCategory } from '../enums/problem-category.enum';
import { ProblemSeverity } from '../enums/problem-severity.enum';
import { JobCard } from './job-card.entity';

/** ENT-6 — a diagnosis finding. Hard-deletable only while not on a sent estimate (UC-9 1a). */
@Entity('problems')
@Index('IDX_problems_job_card', ['jobCardId'])
export class Problem extends AppBaseEntity {
  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ProblemSeverity, enumName: 'problem_severity' })
  severity: ProblemSeverity;

  @Column({ type: 'enum', enum: ProblemCategory, enumName: 'problem_category' })
  category: ProblemCategory;

  /** Found during IN_PROGRESS — needs a new estimate version (UC-9 1b). */
  @Column({ type: 'boolean', default: false })
  requiresNewEstimate: boolean;

  @Column({ type: 'uuid' })
  recordedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'recorded_by_id' })
  recordedBy: User;
}
