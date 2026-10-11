import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AllowedOrderKeys } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { toArray, toBoolean } from '../../../common/utils/query-transform.util';
import { FuelLevel } from '../enums/fuel-level.enum';
import { JobCardStatus } from '../enums/job-card-status.enum';

// ── Response shapes ──────────────────────────────────────────────────────────

export class PersonRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Suresh Kale' }) name: string;
}

export class JobVehicleRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'MH12AB1234' }) registrationNumber: string;
  @ApiProperty({ example: 'Maruti' }) make: string;
  @ApiProperty({ example: 'Swift' }) model: string;
}

export class JobCustomerRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Amit Deshmukh' }) name: string;
  @ApiProperty({ example: '+919876543210' }) phone: string;
}

export class JobCardListItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'JOB-2026-000123' }) jobNumber: string;
  @ApiProperty({ enum: JobCardStatus }) status: JobCardStatus;
  @ApiProperty({ type: JobVehicleRefDto }) vehicle: JobVehicleRefDto;
  @ApiProperty({ type: JobCustomerRefDto }) customer: JobCustomerRefDto;
  @ApiProperty({ type: PersonRefDto, nullable: true }) assignedMechanic: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: Date }) promisedDeliveryAt: Date | null;
  @ApiProperty({ description: 'Open and past promisedDeliveryAt' }) isOverdue: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class JobEstimateSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 2 }) version: number;
  @ApiProperty({ example: 'SENT' }) status: string;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ nullable: true, type: String, example: null }) approvedTotal: string | null;
}

export class JobInvoiceSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'INV-2026-000045' }) invoiceNumber: string;
  @ApiProperty({ example: 'PARTIALLY_PAID' }) status: string;
  @ApiProperty({ example: '1534.00' }) total: string;
  @ApiProperty({ example: '1000.00' }) amountPaid: string;
  @ApiProperty({ example: '534.00' }) balanceDue: string;
}

export class JobCardDetailDto extends JobCardListItemDto {
  @ApiProperty({ example: 42150 }) checkinOdometerKm: number;
  @ApiProperty({ enum: FuelLevel, nullable: true }) fuelLevel: FuelLevel | null;
  @ApiProperty({ example: 'Brake noise; AC not cooling' }) customerComplaints: string;
  @ApiProperty({ type: PersonRefDto }) openedBy: PersonRefDto;
  @ApiProperty({ nullable: true, type: Date }) closedAt: Date | null;
  @ApiProperty() deliveredOnCredit: boolean;
  @ApiProperty({ nullable: true, type: String }) cancellationReason: string | null;
  @ApiProperty({ example: 3 }) problemCount: number;
  @ApiProperty({ type: JobEstimateSummaryDto, nullable: true })
  latestEstimate: JobEstimateSummaryDto | null;
  @ApiProperty({ type: JobInvoiceSummaryDto, nullable: true }) invoice: JobInvoiceSummaryDto | null;
  /** Statuses the CURRENT user may move this job to via POST /status (UI hint, not a guarantee). */
  @ApiProperty({ enum: JobCardStatus, isArray: true }) allowedTransitions: JobCardStatus[];
}

export class JobStatusHistoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: JobCardStatus, nullable: true }) fromStatus: JobCardStatus | null;
  @ApiProperty({ enum: JobCardStatus }) toStatus: JobCardStatus;
  @ApiProperty({
    type: PersonRefDto,
    nullable: true,
    description: 'null = customer link or system',
  })
  changedBy: PersonRefDto | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty() createdAt: Date;
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** GET /job-cards — search: job number, registration, customer name/phone. */
@AllowedOrderKeys(['createdAt', 'promisedDeliveryAt', 'jobNumber'])
export class ListJobCardsQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ enum: JobCardStatus, isArray: true, description: '?status=A&status=B' })
  @IsOptional()
  @Transform(toArray)
  @ArrayMaxSize(9)
  @IsEnum(JobCardStatus, { each: true })
  status?: JobCardStatus[];

  @ApiPropertyOptional({ description: 'Exclude DELIVERED and CANCELLED', default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  openOnly?: boolean;

  @ApiPropertyOptional({ description: "Mechanic's 'my jobs' (assigned-mechanic)", default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  assignedToMe?: boolean;

  @ApiPropertyOptional({ description: 'Open and past promised delivery', default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') assignedMechanicId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') vehicleId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') customerId?: string;
}

/** POST /job-cards (UC-8). */
export class CreateJobCardDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  vehicleId: string;

  @ApiProperty({ example: 42150, description: "≥ the vehicle's last recorded odometer" })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000)
  checkinOdometerKm: number;

  @ApiPropertyOptional({ enum: FuelLevel })
  @IsOptional()
  @IsEnum(FuelLevel)
  fuelLevel?: FuelLevel;

  @ApiProperty({ example: 'Brake noise from front left; AC not cooling' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  customerComplaints: string;

  @ApiPropertyOptional({ example: '2026-10-10T18:00:00+05:30' })
  @IsOptional()
  @IsISO8601({ strict: true })
  promisedDeliveryAt?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Active MECHANIC of this garage' })
  @IsOptional()
  @IsUUID('4')
  assignedMechanicId?: string;
}

/** PATCH /job-cards/:job_card_id — only while not DELIVERED/CANCELLED. */
export class UpdateJobCardDto {
  @ApiPropertyOptional({ enum: FuelLevel }) @IsOptional() @IsEnum(FuelLevel) fuelLevel?: FuelLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  customerComplaints?: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601({ strict: true }) promisedDeliveryAt?: string;
}

/** Transitions a user can request directly. AWAITING_APPROVAL/APPROVED come from estimates; DELIVERED/CANCELLED have their own endpoints. */
export const MANUAL_TARGET_STATUSES = [
  JobCardStatus.DIAGNOSING,
  JobCardStatus.IN_PROGRESS,
  JobCardStatus.QUALITY_CHECK,
  JobCardStatus.READY_FOR_PICKUP,
] as const;

/** POST /job-cards/:job_card_id/status (UC-13). */
export class ChangeJobStatusDto {
  @ApiProperty({ enum: MANUAL_TARGET_STATUSES, example: JobCardStatus.IN_PROGRESS })
  @IsIn(MANUAL_TARGET_STATUSES)
  status: (typeof MANUAL_TARGET_STATUSES)[number];

  @ApiPropertyOptional({ example: 'Parts arrived' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** PATCH /job-cards/:job_card_id/assignee (UC-14). `null` unassigns. */
export class AssignMechanicDto {
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  @IsDefined()
  @ValidateIf((o: AssignMechanicDto) => o.mechanicId !== null)
  @IsUUID('4')
  mechanicId: string | null;
}

/** POST /job-cards/:job_card_id/cancel. */
export class CancelJobCardDto {
  @ApiProperty({ example: 'Customer took the vehicle elsewhere' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}

/** POST /job-cards/:job_card_id/deliver — requires a PAID invoice (AC-15.4). */
export class DeliverJobCardDto {
  @ApiPropertyOptional({
    format: 'date',
    example: '2027-04-08',
    description: 'Updates the vehicle',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  nextServiceDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** POST /job-cards/:job_card_id/deliver-on-credit — GARAGE_ADMIN, mandatory note (UC-15 4a). */
export class DeliverOnCreditDto {
  @ApiProperty({ example: 'Regular fleet customer, pays monthly' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsISO8601({ strict: true })
  nextServiceDate?: string;
}
