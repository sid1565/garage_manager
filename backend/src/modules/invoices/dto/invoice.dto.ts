import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AllowedOrderKeys, IsMoney, IsQuantity } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { LineItemType } from '../../../common/enums';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

// ── Response shapes ──────────────────────────────────────────────────────────

export class InvoicePersonDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Priya Joshi' }) name: string;
}

export class InvoiceLineItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: LineItemType }) itemType: LineItemType;
  @ApiProperty({ example: 'Front brake pads (set)' }) description: string;
  @ApiProperty({ example: '2.00' }) quantity: string;
  @ApiProperty({ example: '500.00' }) unitPrice: string;
  @ApiProperty({ example: '1000.00' }) lineTotal: string;
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'null = added at invoicing',
  })
  sourceEstimateLineItemId: string | null;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '1000.00' }) amount: string;
  @ApiProperty({ enum: PaymentMethod }) method: PaymentMethod;
  @ApiProperty({ nullable: true, type: String, example: 'UPI ref 412345678901' })
  reference: string | null;
  @ApiProperty() receivedAt: Date;
  @ApiProperty({ type: InvoicePersonDto }) receivedBy: InvoicePersonDto;
}

export class InvoiceSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'INV-2026-000045' }) invoiceNumber: string;
  @ApiProperty({ format: 'uuid' }) jobCardId: string;
  @ApiProperty({ example: 'JOB-2026-000123' }) jobNumber: string;
  @ApiProperty({ type: InvoicePersonDto }) customer: InvoicePersonDto;
  @ApiProperty({ example: 'MH12AB1234' }) vehicleRegistration: string;
  @ApiProperty({ enum: InvoiceStatus }) status: InvoiceStatus;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ example: '1000.00' }) amountPaid: string;
  @ApiProperty({ example: '534.00', description: 'total − amountPaid (derived)' })
  balanceDue: string;
  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty() issuedAt: Date;
}

export class InvoiceDto extends InvoiceSummaryDto {
  @ApiProperty({ example: '1300.00' }) subtotal: string;
  @ApiProperty({ example: '0.00' }) discount: string;
  @ApiProperty({ example: '18.00' }) taxRate: string;
  @ApiProperty({ example: '234.00' }) taxAmount: string;
  @ApiProperty({ nullable: true, type: String }) notes: string | null;
  @ApiProperty({ type: [InvoiceLineItemDto] }) items: InvoiceLineItemDto[];
  @ApiProperty({ type: [PaymentDto] }) payments: PaymentDto[];
  @ApiProperty({ type: InvoicePersonDto }) createdBy: InvoicePersonDto;
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** Extra work billed at invoicing time (UC-15 1a). Totals are server-computed. */
export class InvoiceExtraItemDto {
  @ApiProperty({ enum: LineItemType }) @IsEnum(LineItemType) itemType: LineItemType;

  @ApiProperty({ example: 'Wiper fluid top-up' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description: string;

  @ApiProperty({ example: '1' }) @IsQuantity() quantity: string;
  @ApiProperty({ example: '150.00' }) @IsMoney() unitPrice: string;
}

/**
 * POST /job-cards/:job_card_id/invoice (UC-15). Lines = APPROVED estimate items (snapshot)
 * + extraItems. discount ≤ subtotal (400 DISCOUNT_TOO_LARGE). Invoice number from garage_counters.
 */
export class CreateInvoiceDto {
  @ApiPropertyOptional({ type: [InvoiceExtraItemDto], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvoiceExtraItemDto)
  extraItems?: InvoiceExtraItemDto[];

  @ApiPropertyOptional({ example: '100.00', default: '0.00' })
  @IsOptional()
  @IsMoney()
  discount?: string;

  @ApiPropertyOptional({ example: 'Thank you for choosing Speed Garage' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** POST /invoices/:invoice_id/payments (UC-15 step 3). amount ≤ balanceDue (AC-15.3). */
export class RecordPaymentDto {
  @ApiProperty({ example: '1000.00' })
  @IsMoney({ positive: true })
  amount: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.UPI })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ example: 'UPI ref 412345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ description: 'Default now; must not be in the future' })
  @IsOptional()
  @IsISO8601({ strict: true })
  receivedAt?: string;
}

/** GET /invoices — search: invoice number, customer name, registration. */
@AllowedOrderKeys(['issuedAt', 'createdAt', 'invoiceNumber'])
export class ListInvoicesQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  issuedFrom?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-10-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  issuedTo?: string;
}
