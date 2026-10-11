import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import { CreateProblemDto, ProblemDto, UpdateProblemDto } from '../dto/problem.dto';
import { ProblemsService } from '../services/problems.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;
const WRITE_ERRORS = [
  HttpStatus.BAD_REQUEST,
  ...PROTECTED_ERRORS,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
] as const;

/** Diagnosis findings on a job card (UC-9). */
@ApiTags('Job Cards — Problems')
@ApiBearerAuth()
@Controller('job-cards/:job_card_id/problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get()
  @Section(EUserModule.JOB_CARDS_VIEW)
  @ApiOperation({ summary: 'List problems with their photos' })
  @ApiEnvelope(ProblemDto, { isArray: true })
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async list(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<ProblemDto[]>> {
    const result = await this.problemsService.list(user, jobCardId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post()
  @Section(EUserModule.DIAGNOSIS_RECORD)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a diagnosed problem (UC-9)' })
  @ApiEnvelope(ProblemDto, { status: HttpStatus.CREATED })
  @ApiErrors(...WRITE_ERRORS)
  async create(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: CreateProblemDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<ProblemDto>> {
    const result = await this.problemsService.create(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Patch(':problem_id')
  @Section(EUserModule.DIAGNOSIS_RECORD)
  @ApiOperation({ summary: 'Edit a problem not yet on a sent estimate' })
  @ApiEnvelope(ProblemDto)
  @ApiErrors(...WRITE_ERRORS)
  async update(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Param('problem_id', UUIDValidationPipe) problemId: string,
    @Body() dto: UpdateProblemDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<ProblemDto>> {
    const result = await this.problemsService.update(user, jobCardId, problemId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Delete(':problem_id')
  @Section(EUserModule.DIAGNOSIS_RECORD)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a problem not yet on a sent estimate' })
  @ApiNoContentResponse()
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async remove(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Param('problem_id', UUIDValidationPipe) problemId: string,
    @Headers('accept-language') lang: string,
  ): Promise<void> {
    await this.problemsService.remove(user, jobCardId, problemId, lang);
  }
}
