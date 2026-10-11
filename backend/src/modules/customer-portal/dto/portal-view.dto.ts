import { ApiProperty } from '@nestjs/swagger';
import { LineItemType } from '../../../common/enums';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { EstimateStatus } from '../../estimates/enums/estimate-status.enum';
import { LineItemApproval } from '../../estimates/enums/line-item-approval.enum';
import { JobCardStatus } from '../../job-cards/enums/job-card-status.enum';
import { ProblemCategory } from '../../job-cards/enums/problem-category.enum';
import { ProblemSeverity } from '../../job-cards/enums/problem-severity.enum';

/*
 * Vehicle-owner view (UC-12, AC-12.1). These are deliberately separate classes from the
 * staff DTOs: NO staff names/emails, internal notes, cost data, audit info or other jobs.
 */

export class PortalGarageDto {
  @ApiProperty({ example: 'Speed Garage' }) name: string;
  @ApiProperty({ example: '+912012345678' }) phone: string;
  @ApiProperty({ nullable: true, type: String, example: 'Plot 12, MIDC, Pune' })
  address: string | null;
}

export class PortalVehicleDto {
  @ApiProperty({ example: 'MH12AB1234' }) registrationNumber: string;
  @ApiProperty({ example: 'Maruti' }) make: string;
  @ApiProperty({ example: 'Swift' }) model: string;
}

export class PortalPhotoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ nullable: true, type: String }) caption: string | null;
  @ApiProperty({ example: 'image/jpeg' }) mimeType: string;
  /** Relative to the link's portal URL: GET /portal/{token}/{path}. */
  @ApiProperty({ example: 'attachments/7c9e6679-7425-40de-944b-e07fc1f90ae7' }) path: string;
}

export class PortalProblemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Front brake pads worn' }) title: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: ProblemSeverity }) severity: ProblemSeverity;
  @ApiProperty({ enum: ProblemCategory }) category: ProblemCategory;
  @ApiProperty({ type: [PortalPhotoDto] }) photos: PortalPhotoDto[];
}

export class PortalEstimateItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: LineItemType }) itemType: LineItemType;
  @ApiProperty({ example: 'Front brake pads (set)' }) description: string;
  @ApiProperty({ example: '2.00' }) quantity: string;
  @ApiProperty({ example: '500.00' }) unitPrice: string;
  @ApiProperty({ example: '1000.00' }) lineTotal: string;
  @ApiProperty({ enum: LineItemApproval }) approvalState: LineItemApproval;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) problemId: string | null;
}

export class PortalEstimateDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 2 }) version: number;
  @ApiProperty({ enum: EstimateStatus }) status: EstimateStatus;
  @ApiProperty({ example: 'INR' }) currency: string;
  @ApiProperty({ type: [PortalEstimateItemDto] }) items: PortalEstimateItemDto[];
  @ApiProperty({ example: '1300.00' }) subtotal: string;
  @ApiProperty({ example: '18.00' }) taxRate: string;
  @ApiProperty({ example: '234.00' }) taxAmount: string;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ nullable: true, type: String }) approvedTotal: string | null;
  @ApiProperty({ nullable: true, type: Date }) validUntil: Date | null;
  @ApiProperty({ nullable: true, type: Date }) respondedAt: Date | null;
  /** true only for an APPROVE_ESTIMATE link on a SENT, unexpired estimate. */
  @ApiProperty() canRespond: boolean;
}

export class PortalTimelineEntryDto {
  @ApiProperty({ enum: JobCardStatus }) status: JobCardStatus;
  @ApiProperty() at: Date;
}

export class PortalInvoiceDto {
  @ApiProperty({ example: 'INV-2026-000045' }) invoiceNumber: string;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ example: '1000.00' }) amountPaid: string;
  @ApiProperty({ example: '534.00' }) balanceDue: string;
}

export class PortalJobViewDto {
  @ApiProperty({ enum: LinkPurpose }) linkPurpose: LinkPurpose;
  @ApiProperty({ type: PortalGarageDto }) garage: PortalGarageDto;
  @ApiProperty({ example: 'Amit', description: 'Customer first name only' })
  customerFirstName: string;
  @ApiProperty({ type: PortalVehicleDto }) vehicle: PortalVehicleDto;
  @ApiProperty({ example: 'JOB-2026-000123' }) jobNumber: string;
  @ApiProperty({ enum: JobCardStatus }) status: JobCardStatus;
  @ApiProperty() checkedInAt: Date;
  @ApiProperty({ nullable: true, type: Date }) promisedDeliveryAt: Date | null;
  @ApiProperty({ type: [PortalProblemDto] }) problems: PortalProblemDto[];
  /** The estimate this link is for; for VIEW_JOB links, the latest SENT/responded one. */
  @ApiProperty({ type: PortalEstimateDto, nullable: true }) estimate: PortalEstimateDto | null;
  @ApiProperty({ type: [PortalTimelineEntryDto] }) timeline: PortalTimelineEntryDto[];
  @ApiProperty({ type: PortalInvoiceDto, nullable: true }) invoice: PortalInvoiceDto | null;
}
