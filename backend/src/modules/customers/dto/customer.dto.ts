import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AllowedOrderKeys, IsE164Phone } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { NotificationChannel, RecordStatus } from '../../../common/enums';

export class CustomerDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Amit Deshmukh' }) name: string;
  @ApiProperty({ example: '+919876543210' }) phone: string;
  @ApiProperty({ nullable: true, type: String, example: 'amit@example.com' }) email: string | null;
  @ApiProperty({ nullable: true, type: String }) address: string | null;
  @ApiProperty({ enum: NotificationChannel, isArray: true, example: ['SMS', 'EMAIL'] })
  preferredChannels: NotificationChannel[];
  @ApiProperty({ nullable: true, type: String }) notes: string | null;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;
  @ApiProperty({ example: 2 }) vehicleCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CustomerVehicleSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'MH12AB1234' }) registrationNumber: string;
  @ApiProperty({ example: 'Maruti' }) make: string;
  @ApiProperty({ example: 'Swift' }) model: string;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;
}

export class CustomerDetailDto extends CustomerDto {
  @ApiProperty({ type: [CustomerVehicleSummaryDto] }) vehicles: CustomerVehicleSummaryDto[];
}

/** POST /customers result — `duplicate: true` means an existing customer was returned (AC-4.2). */
export class CustomerCreateResultDto extends CustomerDto {
  @ApiProperty({ example: false }) duplicate: boolean;
}

/** GET /customers — search: name (trigram), phone, email. */
@AllowedOrderKeys(['createdAt', 'name'])
export class ListCustomersQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ enum: RecordStatus, description: 'Default: ACTIVE only' })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Amit Deshmukh' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '+919876543210' })
  @IsE164Phone()
  phone: string;

  @ApiPropertyOptional({ example: 'amit@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'Flat 4, Kothrud, Pune' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  /** EMAIL requires `email` to be set (validated in the service → 400 EMAIL_REQUIRED_FOR_CHANNEL). */
  @ApiProperty({ enum: NotificationChannel, isArray: true, example: ['SMS'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(2)
  @IsEnum(NotificationChannel, { each: true })
  preferredChannels: NotificationChannel[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** PATCH /customers/:customer_id. Changing phone to one already in the garage → 409. */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
