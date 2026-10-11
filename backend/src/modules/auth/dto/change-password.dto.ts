import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsAppPassword } from '../../../common/decorators';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ description: '8–72 chars, ≥1 letter and ≥1 digit' })
  @IsAppPassword()
  newPassword: string;
}
