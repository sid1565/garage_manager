import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { decimalTransformer, MONEY_COLUMN } from '../../../common/utils/money.util';
import { Garage } from '../../garages/entities/garage.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { User } from '../../staff/entities/user.entity';
import { InvoiceStatus } from '../enums/invoice-status.enum';

/**
 * ENT-13 — one per job card. Balance due is derived (total − amount_paid),
 * not stored, so it can never drift.
 */
@Entity('invoices')
@Index('UQ_invoices_garage_number', ['garageId', 'invoiceNumber'], { unique: true })
@Index('UQ_invoices_job_card', ['jobCardId'], { unique: true })
@Index('IDX_invoices_garage_status_issued', ['garageId', 'status', 'issuedAt'])
@Check('CHK_invoices_discount_range', `"discount" >= 0 AND "discount" <= "subtotal"`)
@Check('CHK_invoices_paid_range', `"amount_paid" >= 0 AND "amount_paid" <= "total"`)
export class Invoice extends AppBaseEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => JobCard, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: JobCard;

  /** e.g. INV-2026-000045, from garage_counters. */
  @Column({ type: 'varchar', length: 20 })
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    enumName: 'invoice_status',
    default: InvoiceStatus.UNPAID,
  })
  status: InvoiceStatus;

  @Column({ ...MONEY_COLUMN })
  subtotal: string;

  @Column({ ...MONEY_COLUMN, default: 0 })
  discount: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: decimalTransformer })
  taxRate: string;

  @Column({ ...MONEY_COLUMN })
  taxAmount: string;

  @Column({ ...MONEY_COLUMN })
  total: string;

  /** Running sum of payments, updated in the same transaction as each payment. */
  @Column({ ...MONEY_COLUMN, default: 0 })
  amountPaid: string;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;
}
