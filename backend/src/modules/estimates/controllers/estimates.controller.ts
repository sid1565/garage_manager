import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import {
  EstimateDto,
  EstimateSummaryDto,
  SendEstimateDto,
  SentEstimateDto,
  UpsertEstimateDto,
  VerbalApprovalDto,
} from '../dto/estimate.dto';
import { EstimatesService } from '../services/estimates.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;
const WRITE_ERRORS = [
  HttpStatus.BAD_REQUEST,
  ...PROTECTED_ERRORS,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
] as const;

/** Creating/listing is nested under the job card; single-estimate actions are top-level. */
@ApiTags('Estimates')
@ApiBearerAuth()
@Controller()
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get('job-cards/:job_card_id/estimates')
  @Section(EUserModule.ESTIMATES_VIEW)
  @ApiOperation({ summary: 'All estimate versions of a job, newest first' })
  @ApiEnvelope(EstimateSummaryDto, { isArray: true })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async listForJob(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<EstimateSummaryDto[]>> {
    const result = await this.estimatesService.listForJob(user, jobCardId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('job-cards/:job_card_id/estimates')
  @Section(EUserModule.ESTIMATES_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a DRAFT estimate with line items (UC-11)' })
  @ApiEnvelope(EstimateDto, { status: HttpStatus.CREATED })
  @ApiErrors(...WRITE_ERRORS)
  async create(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: UpsertEstimateDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<EstimateDto>> {
    const result = await this.estimatesService.create(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Get('estimates/:estimate_id')
  @Section(EUserModule.ESTIMATES_VIEW)
  @ApiOperation({ summary: 'Estimate with line items' })
  @ApiEnvelope(EstimateDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('estimate_id', UUIDValidationPipe) estimateId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<EstimateDto>> {
    const result = await this.estimatesService.findOne(user, estimateId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Put('estimates/:estimate_id')
  @Section(EUserModule.ESTIMATES_MANAGE)
  @ApiOperation({ summary: 'Replace the line items of a DRAFT estimate (idempotent)' })
  @ApiEnvelope(EstimateDto)
  @ApiErrors(...WRITE_ERRORS)
  async replace(
    @CurrentUser() user: IAuthUser,
    @Param('estimate_id', UUIDValidationPipe) estimateId: string,
    @Body() dto: UpsertEstimateDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<EstimateDto>> {
    const result = await this.estimatesService.replace(user, estimateId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('estimates/:estimate_id/send')
  @Section(EUserModule.ESTIMATES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send to the owner for approval — link via SMS/email (UC-11)' })
  @ApiEnvelope(SentEstimateDto)
  @ApiErrors(...WRITE_ERRORS)
  async send(
    @CurrentUser() user: IAuthUser,
    @Param('estimate_id', UUIDValidationPipe) estimateId: string,
    @Body() dto: SendEstimateDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<SentEstimateDto>> {
    const result = await this.estimatesService.send(user, estimateId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('estimates/:estimate_id/verbal-approval')
  @Section(EUserModule.ESTIMATES_VERBAL_APPROVAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Record the owner's decision taken by phone/in person (UC-12 2a)" })
  @ApiEnvelope(EstimateDto)
  @ApiErrors(...WRITE_ERRORS)
  async recordVerbalApproval(
    @CurrentUser() user: IAuthUser,
    @Param('estimate_id', UUIDValidationPipe) estimateId: string,
    @Body() dto: VerbalApprovalDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<EstimateDto>> {
    const result = await this.estimatesService.recordVerbalApproval(user, estimateId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Delete('estimates/:estimate_id')
  @Section(EUserModule.ESTIMATES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a DRAFT estimate' })
  @ApiNoContentResponse()
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async remove(
    @CurrentUser() user: IAuthUser,
    @Param('estimate_id', UUIDValidationPipe) estimateId: string,
    @Headers('accept-language') lang: string,
  ): Promise<void> {
    await this.estimatesService.remove(user, estimateId, lang);
  }
}
