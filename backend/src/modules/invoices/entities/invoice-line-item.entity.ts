import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { LineItemType } from '../../../common/enums';
import { decimalTransformer, MONEY_COLUMN } from '../../../common/utils/money.util';
import { EstimateLineItem } from '../../estimates/entities/estimate-line-item.entity';
import { Invoice } from './invoice.entity';

/** Snapshot of billed items — later estimate edits never change an issued invoice. */
@Entity('invoice_line_items')
@Index('IDX_invoice_line_items_invoice', ['invoiceId', 'sortOrder'])
@Check('CHK_invoice_line_items_quantity_positive', `"quantity" > 0`)
@Check('CHK_invoice_line_items_unit_price_non_negative', `"unit_price" >= 0`)
export class InvoiceLineItem extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  /** null for items added at invoicing time (UC-15 1a). */
  @Column({ type: 'uuid', nullable: true })
  sourceEstimateLineItemId: string | null;

  @ManyToOne(() => EstimateLineItem, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'source_estimate_line_item_id' })
  sourceEstimateLineItem: EstimateLineItem | null;

  @Column({ type: 'enum', enum: LineItemType, enumName: 'line_item_type' })
  itemType: LineItemType;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  quantity: string;

  @Column({ ...MONEY_COLUMN })
  unitPrice: string;

  @Column({ ...MONEY_COLUMN })
  lineTotal: string;

  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;
}
