import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { Estimate } from '../../estimates/entities/estimate.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { LinkPurpose } from '../enums/link-purpose.enum';

/**
 * ENT-12 — single-purpose owner link (NFR-5). Only the SHA-256 hash of the
 * 256-bit token is stored; lookups go through the unique token_hash index.
 */
@Entity('customer_access_links')
@Index('IDX_customer_access_links_job', ['jobCardId'])
@Index('IDX_customer_access_links_estimate', ['estimateId'])
@Check(
  'CHK_customer_access_links_estimate_purpose',
  `("purpose" = 'APPROVE_ESTIMATE') = ("estimate_id" IS NOT NULL)`,
)
export class CustomerAccessLink extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  @Column({ type: 'uuid', nullable: true })
  estimateId: string | null;

  @ManyToOne(() => Estimate, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'estimate_id' })
  estimate: Estimate | null;

  @Column({ type: 'enum', enum: LinkPurpose, enumName: 'link_purpose' })
  purpose: LinkPurpose;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Revoked when the estimate is superseded (AC-11.3). */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Approval submitted; link stays valid for viewing (UC-12 postconditions). */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt: Date | null;
}
