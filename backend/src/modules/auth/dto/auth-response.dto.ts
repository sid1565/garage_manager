import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../../common/enums';

export class AuthUserDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty({ nullable: true, type: String }) garageId: string | null;
  @ApiProperty({ nullable: true, type: String }) garageName: string | null;
  @ApiProperty() mustChangePassword: boolean;
}

export class AuthSessionDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds' })
  expiresIn: number;
  @ApiPropertyOptional({
    description: 'Only for x-client-type: mobile — web gets an httpOnly cookie',
  })
  refreshToken?: string;
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
}

export class AuthSessionResponseDto {
  @ApiProperty({ example: 200 }) status: number;
  @ApiProperty() message: string;
  @ApiProperty({ type: AuthSessionDto }) data: AuthSessionDto;
}

export class AuthUserResponseDto {
  @ApiProperty({ example: 200 }) status: number;
  @ApiProperty() message: string;
  @ApiProperty({ type: AuthUserDto }) data: AuthUserDto;
}

export class EmptyResponseDto {
  @ApiProperty({ example: 200 }) status: number;
  @ApiProperty() message: string;
  @ApiProperty({ type: Object, nullable: true, example: null }) data: null;
}
