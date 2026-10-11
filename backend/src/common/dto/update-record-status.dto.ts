import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RecordStatus } from '../enums';

/** Soft delete / reactivate (NFR-11). */
export class UpdateRecordStatusDto {
  @ApiProperty({ enum: RecordStatus, example: RecordStatus.INACTIVE })
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
