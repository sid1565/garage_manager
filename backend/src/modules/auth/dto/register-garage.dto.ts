import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsAppPassword } from '../../../common/decorators';

const E164 = /^\+[1-9]\d{7,14}$/;

export class RegisterGarageDto {
  @ApiProperty({ example: 'Speed Garage' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  garageName: string;

  @ApiProperty({ example: '+912012345678', description: 'E.164' })
  @Matches(E164, { message: 'garagePhone must be in E.164 format' })
  garagePhone: string;

  @ApiPropertyOptional({ example: 'Pune' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: 'Ravi Patil' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'owner@speedgarage.in' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(E164, { message: 'phone must be in E.164 format' })
  phone?: string;

  @ApiProperty({ example: 'Garage2026', description: '8–72 chars, ≥1 letter and ≥1 digit' })
  @IsAppPassword()
  password: string;
}
