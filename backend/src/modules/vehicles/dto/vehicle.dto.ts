import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AllowedOrderKeys } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { RecordStatus } from '../../../common/enums';
import { FuelType } from '../enums/fuel-type.enum';

export class VehicleOwnerSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Amit Deshmukh' }) name: string;
  @ApiProperty({ example: '+919876543210' }) phone: string;
}

export class VehicleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'MH12AB1234', description: 'Normalised: uppercase, no spaces' })
  registrationNumber: string;
  @ApiProperty({ nullable: true, type: String, example: 'MA3FJEB1S00123456' }) vin: string | null;
  @ApiProperty({ example: 'Maruti' }) make: string;
  @ApiProperty({ example: 'Swift' }) model: string;
  @ApiProperty({ nullable: true, type: String, example: 'VXI' }) variant: string | null;
  @ApiProperty({ nullable: true, type: Number, example: 2021 }) manufactureYear: number | null;
  @ApiProperty({ enum: FuelType }) fuelType: FuelType;
  @ApiProperty({ nullable: true, type: String, example: 'Red' }) color: string | null;
  @ApiProperty({ example: 42150 }) odometerKm: number;
  @ApiProperty({ nullable: true, type: String, example: '2027-01-15', format: 'date' })
  nextServiceDate: string | null;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;
  @ApiProperty({ type: VehicleOwnerSummaryDto }) owner: VehicleOwnerSummaryDto;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class VehicleOpenJobSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'JOB-2026-000123' }) jobNumber: string;
  @ApiProperty({ example: 'IN_PROGRESS' }) status: string;
  @ApiProperty() createdAt: Date;
}

export class VehicleDetailDto extends VehicleDto {
  @ApiProperty({ type: VehicleOpenJobSummaryDto, nullable: true })
  openJobCard: VehicleOpenJobSummaryDto | null;
}

export class ServiceHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) jobCardId: string;
  @ApiProperty({ example: 'JOB-2026-000098' }) jobNumber: string;
  @ApiProperty({ example: 'DELIVERED' }) status: string;
  @ApiProperty({ example: 40210 }) checkinOdometerKm: number;
  @ApiProperty({ example: 'Brake noise, AC not cooling' }) customerComplaints: string;
  @ApiProperty({ type: [String], example: ['Front brake pads worn'] }) problemTitles: string[];
  @ApiProperty({ nullable: true, type: String, example: 'INV-2026-000045' })
  invoiceNumber: string | null;
  @ApiProperty({ nullable: true, type: String, example: '5420.00' }) invoiceTotal: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: Date }) closedAt: Date | null;
}

/** GET /vehicles — search: registration number (partial), owner name, owner phone. */
@AllowedOrderKeys(['createdAt', 'registrationNumber', 'nextServiceDate'])
export class ListVehiclesQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ enum: RecordStatus, description: 'Default: ACTIVE only' })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  /** Vehicles due for service on or before this date. */
  @ApiPropertyOptional({ format: 'date', example: '2026-11-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  serviceDueBefore?: string;
}

/** GET /vehicles/:vehicle_id/service-history — newest first by default. */
@AllowedOrderKeys(['createdAt'])
export class ServiceHistoryQueryDto extends FindAllQueryDto {}

const THIS_YEAR = new Date().getFullYear();

export class CreateVehicleDto {
  @ApiProperty({ format: 'uuid', description: 'Owner — must be an ACTIVE customer of this garage' })
  @IsUUID('4')
  customerId: string;

  /** Spaces and hyphens allowed on input; stored normalised (AC-5.1). */
  @ApiProperty({ example: 'MH 12 AB 1234' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 -]{2,24}$/, {
    message: 'registrationNumber may contain letters, digits, spaces and hyphens (3–25 chars)',
  })
  registrationNumber: string;

  @ApiPropertyOptional({ example: 'MA3FJEB1S00123456' })
  @IsOptional()
  @Matches(/^[A-HJ-NPR-Za-hj-npr-z0-9]{17}$/, { message: 'vin must be 17 characters (no I, O, Q)' })
  vin?: string;

  @ApiProperty({ example: 'Maruti' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  make: string;

  @ApiProperty({ example: 'Swift' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  model: string;

  @ApiPropertyOptional({ example: 'VXI' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  variant?: string;

  @ApiPropertyOptional({ example: 2021 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(THIS_YEAR + 1)
  manufactureYear?: number;

  @ApiProperty({ enum: FuelType })
  @IsEnum(FuelType)
  fuelType: FuelType;

  @ApiPropertyOptional({ example: 'Red' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiPropertyOptional({ example: 42150, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000)
  odometerKm?: number;

  @ApiPropertyOptional({ format: 'date', example: '2027-01-15' })
  @IsOptional()
  @IsISO8601({ strict: true })
  nextServiceDate?: string;
}

/**
 * PATCH /vehicles/:vehicle_id — owner changes go through /transfer.
 * odometerKm may only increase (400 ODOMETER_DECREASED).
 */
export class UpdateVehicleDto extends PartialType(
  OmitType(CreateVehicleDto, ['customerId'] as const),
) {}

/** POST /vehicles/:vehicle_id/transfer — UC-7 alternate flow. */
export class TransferVehicleDto {
  @ApiProperty({ format: 'uuid', description: 'New owner in the same garage' })
  @IsUUID('4')
  customerId: string;
}
