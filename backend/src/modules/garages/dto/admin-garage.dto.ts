import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AllowedOrderKeys } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { GarageStatus } from '../enums/garage-status.enum';

/** GET /admin/garages — search: name, phone, email. */
@AllowedOrderKeys(['createdAt', 'name'])
export class ListGaragesQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ enum: GarageStatus })
  @IsOptional()
  @IsEnum(GarageStatus)
  status?: GarageStatus;
}

/** PATCH /admin/garages/:garage_id/status (UC-19). */
export class UpdateGarageStatusDto {
  @ApiProperty({ enum: GarageStatus, example: GarageStatus.SUSPENDED })
  @IsEnum(GarageStatus)
  status: GarageStatus;

  /** Recorded in the audit log. */
  @ApiProperty({ example: 'Subscription unpaid for 60 days' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
