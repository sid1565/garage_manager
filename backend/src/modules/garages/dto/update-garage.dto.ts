import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsE164Phone, IsPercentage } from '../../../common/decorators';

/** PATCH /garages/current — all fields optional; `status` is NOT editable here (platform only). */
export class UpdateGarageDto {
  @ApiPropertyOptional({ example: 'Speed Garage' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) addressLine?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) postalCode?: string;

  @ApiPropertyOptional({ example: '+912012345678' })
  @IsOptional()
  @IsE164Phone()
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) email?: string;

  @ApiPropertyOptional({ example: '27AAAPL1234C1ZV' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  /** Applies to estimates created after the change; existing ones keep their snapshot. */
  @ApiPropertyOptional({ example: '18.00' })
  @IsOptional()
  @IsPercentage()
  taxRate?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
