import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AllowedOrderKeys, IsAppPassword, IsE164Phone } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { RecordStatus, UserRole } from '../../../common/enums';

/** Roles a garage admin may grant. PLATFORM_ADMIN is never assignable through the API. */
export const GARAGE_ROLES = [
  UserRole.GARAGE_ADMIN,
  UserRole.SERVICE_ADVISOR,
  UserRole.MECHANIC,
] as const;
export type GarageRole = (typeof GARAGE_ROLES)[number];

export class StaffDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Suresh Kale' }) name: string;
  @ApiProperty({ example: 'suresh@speedgarage.in' }) email: string;
  @ApiProperty({ nullable: true, type: String, example: '+919812345678' }) phone: string | null;
  @ApiProperty({ enum: GARAGE_ROLES }) role: GarageRole;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;
  @ApiProperty({ example: true }) mustChangePassword: boolean;
  @ApiProperty({ nullable: true, type: Date }) lastLoginAt: Date | null;
  @ApiProperty() createdAt: Date;
}

/** GET /staff — search: name, email, phone. */
@AllowedOrderKeys(['createdAt', 'name'])
export class ListStaffQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ enum: GARAGE_ROLES })
  @IsOptional()
  @IsIn(GARAGE_ROLES)
  role?: GarageRole;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

/** POST /staff (UC-3). The account must change this password on first login. */
export class CreateStaffDto {
  @ApiProperty({ example: 'Suresh Kale' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'suresh@speedgarage.in' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: '+919812345678' })
  @IsOptional()
  @IsE164Phone()
  phone?: string;

  @ApiProperty({ enum: GARAGE_ROLES, example: UserRole.MECHANIC })
  @IsIn(GARAGE_ROLES)
  role: GarageRole;

  @ApiProperty({ example: 'Welcome2026', description: '8–72 chars, ≥1 letter and ≥1 digit' })
  @IsAppPassword()
  temporaryPassword: string;
}

/** PATCH /staff/:staff_id — email is immutable (it is the login id). */
export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsE164Phone()
  phone?: string;

  @ApiPropertyOptional({ enum: GARAGE_ROLES })
  @IsOptional()
  @IsIn(GARAGE_ROLES)
  role?: GarageRole;
}

/** POST /staff/:staff_id/reset-password — admin-issued temporary password. */
export class ResetStaffPasswordDto {
  @ApiProperty({ example: 'Welcome2026' })
  @IsAppPassword()
  temporaryPassword: string;
}
