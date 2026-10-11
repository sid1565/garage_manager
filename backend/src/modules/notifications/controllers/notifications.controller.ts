import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import {
  ListNotificationsQueryDto,
  NotificationDto,
  NotifyOwnerDto,
  NotifyOwnerResultDto,
} from '../dto/notification.dto';
import { NotificationsService } from '../services/notifications.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  @Section(EUserModule.NOTIFICATIONS_VIEW)
  @ApiOperation({ summary: 'Notification log with delivery status (UC-16)' })
  @ApiEnvelope(NotificationDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListNotificationsQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<NotificationDto>> {
    const result = await this.notificationsService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  /** 202: messages are queued, not yet delivered (NFR-2). */
  @Post('job-cards/:job_card_id/notifications')
  @Section(EUserModule.NOTIFICATIONS_SEND)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Notify the vehicle owner about problems / status (UC-10)' })
  @ApiEnvelope(NotifyOwnerResultDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async notifyOwner(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: NotifyOwnerDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<NotifyOwnerResultDto>> {
    const result = await this.notificationsService.notifyOwner(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.ACCEPTED);
  }

  @Post('notifications/:notification_id/retry')
  @Section(EUserModule.NOTIFICATIONS_SEND)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Re-queue a FAILED notification (UC-16)' })
  @ApiEnvelope(NotificationDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async retry(
    @CurrentUser() user: IAuthUser,
    @Param('notification_id', UUIDValidationPipe) notificationId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<NotificationDto>> {
    const result = await this.notificationsService.retry(user, notificationId, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.ACCEPTED);
  }
}
