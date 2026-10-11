import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { decimalTransformer, MONEY_COLUMN } from '../../../common/utils/money.util';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { User } from '../../staff/entities/user.entity';
import { ApprovalMethod } from '../enums/approval-method.enum';
import { EstimateStatus } from '../enums/estimate-status.enum';

/** ENT-8 — versioned per job card; all totals computed server-side (NFR-6). */
@Entity('estimates')
@Index('UQ_estimates_job_version', ['jobCardId', 'version'], { unique: true })
// Only one estimate per job may be awaiting the customer at a time (UC-11 3a).
@Index('UQ_estimates_one_sent_per_job', ['jobCardId'], {
  unique: true,
  where: `"status" = 'SENT'`,
})
@Check(
  'CHK_estimates_amounts_non_negative',
  `"subtotal" >= 0 AND "tax_amount" >= 0 AND "total" >= 0`,
)
@Check(
  'CHK_estimates_verbal_note',
  `"approval_method" IS DISTINCT FROM 'VERBAL' OR "verbal_approval_note" IS NOT NULL`,
)
export class Estimate extends AppBaseEntity {
  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  @Column({ type: 'smallint' })
  version: number;

  @Column({
    type: 'enum',
    enum: EstimateStatus,
    enumName: 'estimate_status',
    default: EstimateStatus.DRAFT,
  })
  status: EstimateStatus;

  @Column({ ...MONEY_COLUMN, default: 0 })
  subtotal: string;

  /** Snapshot of the garage tax rate when the estimate was built. */
  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: decimalTransformer })
  taxRate: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  taxAmount: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  total: string;

  /** Total of APPROVED items incl. tax — set on response (AC-12.3). */
  @Column({ ...MONEY_COLUMN, nullable: true })
  approvedTotal: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  customerRemark: string | null;

  @Column({ type: 'enum', enum: ApprovalMethod, enumName: 'approval_method', nullable: true })
  approvalMethod: ApprovalMethod | null;

  /** Mandatory when approvalMethod = VERBAL (AC-12.9). */
  @Column({ type: 'text', nullable: true })
  verbalApprovalNote: string | null;

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  /** Staff member who recorded a verbal approval. */
  @Column({ type: 'uuid', nullable: true })
  respondedByStaffId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'responded_by_staff_id' })
  respondedByStaff: User | null;
}
