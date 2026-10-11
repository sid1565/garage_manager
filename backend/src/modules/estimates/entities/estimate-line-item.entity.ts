import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { LineItemType } from '../../../common/enums';
import { decimalTransformer, MONEY_COLUMN } from '../../../common/utils/money.util';
import { Problem } from '../../job-cards/entities/problem.entity';
import { LineItemApproval } from '../enums/line-item-approval.enum';
import { Estimate } from './estimate.entity';

/** ENT-9. */
@Entity('estimate_line_items')
@Index('IDX_estimate_line_items_estimate', ['estimateId', 'sortOrder'])
@Index('IDX_estimate_line_items_problem', ['problemId'])
@Check('CHK_estimate_line_items_quantity_positive', `"quantity" > 0`)
@Check('CHK_estimate_line_items_unit_price_non_negative', `"unit_price" >= 0`)
export class EstimateLineItem extends AppBaseEntity {
  @Column({ type: 'uuid' })
  estimateId: string;

  @ManyToOne(() => Estimate, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'estimate_id' })
  estimate: Estimate;

  /** Problem this item fixes, shown to the owner next to the finding. */
  @Column({ type: 'uuid', nullable: true })
  problemId: string | null;

  @ManyToOne(() => Problem, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'problem_id' })
  problem: Problem | null;

  @Column({ type: 'enum', enum: LineItemType, enumName: 'line_item_type' })
  itemType: LineItemType;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  /** Hours for LABOUR, units for PART. */
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  quantity: string;

  @Column({ ...MONEY_COLUMN })
  unitPrice: string;

  /** quantity × unitPrice, computed server-side. */
  @Column({ ...MONEY_COLUMN })
  lineTotal: string;

  @Column({
    type: 'enum',
    enum: LineItemApproval,
    enumName: 'line_item_approval',
    default: LineItemApproval.PENDING,
  })
  approvalState: LineItemApproval;

  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;
}
