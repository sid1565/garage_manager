import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@speedgarage.in' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** No policy check here — only on set/change; just bound the bcrypt input. */
  @ApiProperty({ example: 'Garage2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
