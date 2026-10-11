import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsMoney, IsQuantity } from '../../../common/decorators';
import { LineItemType, NotificationChannel } from '../../../common/enums';
import { ApprovalMethod } from '../enums/approval-method.enum';
import { EstimateStatus } from '../enums/estimate-status.enum';
import { LineItemApproval } from '../enums/line-item-approval.enum';

// ── Response shapes ──────────────────────────────────────────────────────────

export class EstimateLineItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: LineItemType }) itemType: LineItemType;
  @ApiProperty({ example: 'Front brake pads (set)' }) description: string;
  @ApiProperty({ example: '2.00' }) quantity: string;
  @ApiProperty({ example: '500.00' }) unitPrice: string;
  @ApiProperty({ example: '1000.00', description: 'quantity × unitPrice, server-computed' })
  lineTotal: string;
  @ApiProperty({ enum: LineItemApproval }) approvalState: LineItemApproval;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) problemId: string | null;
  @ApiProperty({ example: 0 }) sortOrder: number;
}

export class EstimateCreatorDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Priya Joshi' }) name: string;
}

export class EstimateSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) jobCardId: string;
  @ApiProperty({ example: 1 }) version: number;
  @ApiProperty({ enum: EstimateStatus }) status: EstimateStatus;
  @ApiProperty({ example: '1300.00' }) subtotal: string;
  @ApiProperty({ example: '18.00' }) taxRate: string;
  @ApiProperty({ example: '234.00' }) taxAmount: string;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ nullable: true, type: String, example: '1180.00' }) approvedTotal: string | null;
  @ApiProperty({ nullable: true, type: Date }) validUntil: Date | null;
  @ApiProperty({ nullable: true, type: Date }) sentAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) respondedAt: Date | null;
  @ApiProperty({ enum: ApprovalMethod, nullable: true }) approvalMethod: ApprovalMethod | null;
  @ApiProperty({ type: EstimateCreatorDto }) createdBy: EstimateCreatorDto;
  @ApiProperty() createdAt: Date;
}

export class EstimateDto extends EstimateSummaryDto {
  @ApiProperty({ nullable: true, type: String }) customerRemark: string | null;
  @ApiProperty({ nullable: true, type: String }) verbalApprovalNote: string | null;
  @ApiProperty({ type: [EstimateLineItemDto] }) items: EstimateLineItemDto[];
  @ApiProperty() updatedAt: Date;
}

/** POST /estimates/:estimate_id/send result. */
export class SentEstimateDto extends EstimateDto {
  @ApiProperty({ example: 2, description: 'Notifications queued (one per channel)' })
  notificationsQueued: number;
}

// ── Requests ─────────────────────────────────────────────────────────────────

/**
 * A line as entered by staff. There are NO total fields: line totals, subtotal, tax
 * and total are always computed server-side (NFR-6, AC-11.1); unknown fields → 400.
 */
export class EstimateLineItemInputDto {
  @ApiProperty({ enum: LineItemType, example: LineItemType.PART })
  @IsEnum(LineItemType)
  itemType: LineItemType;

  @ApiProperty({ example: 'Front brake pads (set)' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  description: string;

  @ApiProperty({ example: '2', description: 'Units for PART, hours for LABOUR; > 0' })
  @IsQuantity()
  quantity: string;

  @ApiProperty({ example: '500.00' })
  @IsMoney()
  unitPrice: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Problem on the same job card' })
  @IsOptional()
  @IsUUID('4')
  problemId?: string;
}

/** POST /job-cards/:job_card_id/estimates and PUT /estimates/:estimate_id (DRAFT only). */
export class UpsertEstimateDto {
  @ApiProperty({ type: [EstimateLineItemInputDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EstimateLineItemInputDto)
  items: EstimateLineItemInputDto[];

  @ApiPropertyOptional({
    example: '2026-10-15T23:59:59+05:30',
    description: 'Default: +7 days on send',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  validUntil?: string;
}

/** POST /estimates/:estimate_id/send (UC-11 step 3). */
export class SendEstimateDto {
  @ApiPropertyOptional({
    enum: NotificationChannel,
    isArray: true,
    description: "Default: customer's preferred channels",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ example: 'Pads are urgent; rest can wait.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

/** One decision per line item; every PENDING item of the estimate must be decided. */
export class LineItemDecisionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  lineItemId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  approved: boolean;
}

/** Shared by staff verbal approval and the customer portal response. */
export class EstimateDecisionDto {
  @ApiProperty({ type: [LineItemDecisionDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineItemDecisionDto)
  decisions: LineItemDecisionDto[];

  @ApiPropertyOptional({ example: 'Please do the brakes only for now' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

/** POST /estimates/:estimate_id/verbal-approval (UC-12 2a) — note is mandatory (AC-12.9). */
export class VerbalApprovalDto extends EstimateDecisionDto {
  @ApiProperty({ example: 'Owner approved by phone at 11:40, spoke to Amit' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;
}
