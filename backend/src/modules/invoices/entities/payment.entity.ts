import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { MONEY_COLUMN } from '../../../common/utils/money.util';
import { Garage } from '../../garages/entities/garage.entity';
import { User } from '../../staff/entities/user.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Invoice } from './invoice.entity';

/**
 * ENT-14 — append-only. garage_id is denormalised from the invoice so revenue
 * for the dashboard (UC-17) is a single index range scan.
 */
@Entity('payments')
@Index('IDX_payments_invoice', ['invoiceId'])
@Index('IDX_payments_garage_received', ['garageId', 'receivedAt'])
@Check('CHK_payments_amount_positive', `"amount" > 0`)
export class Payment extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  garageId: string;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage;

  @Column({ type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ ...MONEY_COLUMN })
  amount: string;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method' })
  method: PaymentMethod;

  /** Card slip / UPI transaction id. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'uuid' })
  receivedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'received_by_id' })
  receivedBy: User;
}
