import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  AssignMechanicDto,
  CancelJobCardDto,
  ChangeJobStatusDto,
  CreateJobCardDto,
  DeliverJobCardDto,
  DeliverOnCreditDto,
  JobCardDetailDto,
  JobCardListItemDto,
  JobStatusHistoryDto,
  ListJobCardsQueryDto,
  UpdateJobCardDto,
} from '../dto/job-card.dto';
import { JobCardsService } from '../services/job-cards.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;
const WRITE_ERRORS = [
  HttpStatus.BAD_REQUEST,
  ...PROTECTED_ERRORS,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
] as const;

@ApiTags('Job Cards')
@ApiBearerAuth()
@Controller('job-cards')
export class JobCardsController {
  constructor(private readonly jobCardsService: JobCardsService) {}

  @Get()
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'Job board with filters (status, mechanic, overdue, my jobs)' })
  @ApiEnvelope(JobCardListItemDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListJobCardsQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<JobCardListItemDto>> {
    const result = await this.jobCardsService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Post()
  @Section(EUserModule.JOB_CARDS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Check a vehicle in — open a job card (UC-8)' })
  @ApiEnvelope(JobCardDetailDto, { status: HttpStatus.CREATED })
  @ApiErrors(...WRITE_ERRORS)
  async create(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateJobCardDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.create(user, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Get(':job_card_id')
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'Job card detail with estimate and invoice summary' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.findOne(user, jobCardId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch(':job_card_id')
  @Section(EUserModule.JOB_CARDS_MANAGE)
  @ApiOperation({ summary: 'Edit check-in details (complaints, fuel, promised date)' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async update(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: UpdateJobCardDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.update(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':job_card_id/status')
  @Section(EUserModule.JOB_STATUS_UPDATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move the job through its lifecycle (UC-13)',
    description: 'Mechanics: only IN_PROGRESS → QUALITY_CHECK on jobs assigned to them.',
  })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async changeStatus(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: ChangeJobStatusDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.changeStatus(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch(':job_card_id/assignee')
  @Section(EUserModule.JOB_ASSIGN)
  @ApiOperation({ summary: 'Assign or unassign a mechanic (UC-14)' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async assignMechanic(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: AssignMechanicDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.assignMechanic(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':job_card_id/cancel')
  @Section(EUserModule.JOB_CARDS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an open job with a reason' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async cancel(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: CancelJobCardDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.cancel(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':job_card_id/deliver')
  @Section(EUserModule.JOB_CARDS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand the vehicle back — requires a PAID invoice (UC-15)' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async deliver(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: DeliverJobCardDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.deliver(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':job_card_id/deliver-on-credit')
  @Section(EUserModule.DELIVER_ON_CREDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand back with an unpaid balance — admin only (UC-15 4a)' })
  @ApiEnvelope(JobCardDetailDto)
  @ApiErrors(...WRITE_ERRORS)
  async deliverOnCredit(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: DeliverOnCreditDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobCardDetailDto>> {
    const result = await this.jobCardsService.deliverOnCredit(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Get(':job_card_id/status-history')
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'Status timeline, oldest first' })
  @ApiEnvelope(JobStatusHistoryDto, { isArray: true })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async statusHistory(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<JobStatusHistoryDto[]>> {
    const result = await this.jobCardsService.statusHistory(user, jobCardId, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
