import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Mobile clients send the refresh token in the body; web clients rely on the cookie. */
export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Mobile only (x-client-type: mobile)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  refreshToken?: string;
}
