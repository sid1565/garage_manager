import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AllowedOrderKeys } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { NotificationChannel } from '../../../common/enums';
import { NotificationStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationSenderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Priya Joshi' }) name: string;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) jobCardId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) customerId: string | null;
  @ApiProperty({ enum: NotificationType }) type: NotificationType;
  @ApiProperty({ enum: NotificationChannel }) channel: NotificationChannel;
  @ApiProperty({ example: '+919876543210' }) recipient: string;
  @ApiProperty({ nullable: true, type: String }) subject: string | null;
  /** Rendered content. Link tokens inside are masked in API responses (…/portal/•••). */
  @ApiProperty({ example: 'Speed Garage: we found 2 issues on MH12AB1234. View: …' }) body: string;
  @ApiProperty({ enum: NotificationStatus }) status: NotificationStatus;
  @ApiProperty({ example: 1 }) attempts: number;
  @ApiProperty({ nullable: true, type: String }) lastError: string | null;
  @ApiProperty({ nullable: true, type: Date }) sentAt: Date | null;
  @ApiProperty({ type: NotificationSenderDto, nullable: true })
  createdBy: NotificationSenderDto | null;
  @ApiProperty() createdAt: Date;
}

/** POST /job-cards/:job_card_id/notifications result. */
export class NotifyOwnerResultDto {
  @ApiProperty({ type: [NotificationDto] }) notifications: NotificationDto[];
  @ApiProperty({ description: 'Expiry of the VIEW_JOB link embedded in the message' })
  linkExpiresAt: Date;
}

/** GET /notifications — search: recipient. */
@AllowedOrderKeys(['createdAt'])
export class ListNotificationsQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') jobCardId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') customerId?: string;

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

/** Types staff may send by hand; the rest are emitted automatically by events (UC-10 4a). */
export const MANUAL_NOTIFICATION_TYPES = [
  NotificationType.PROBLEMS_FOUND,
  NotificationType.JOB_CHECKED_IN,
  NotificationType.READY_FOR_PICKUP,
] as const;

/** POST /job-cards/:job_card_id/notifications (UC-10). */
export class NotifyOwnerDto {
  @ApiProperty({ enum: MANUAL_NOTIFICATION_TYPES, example: NotificationType.PROBLEMS_FOUND })
  @IsIn(MANUAL_NOTIFICATION_TYPES)
  type: (typeof MANUAL_NOTIFICATION_TYPES)[number];

  @ApiPropertyOptional({
    enum: NotificationChannel,
    isArray: true,
    description: "Default: customer's preferred channels",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ example: 'Please call us before 6 pm.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
