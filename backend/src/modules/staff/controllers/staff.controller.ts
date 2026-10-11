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
import { UpdateRecordStatusDto } from '../../../common/dto/update-record-status.dto';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import {
  CreateStaffDto,
  ListStaffQueryDto,
  ResetStaffPasswordDto,
  StaffDto,
  UpdateStaffDto,
} from '../dto/staff.dto';
import { StaffService } from '../services/staff.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Section(EUserModule.STAFF_VIEW)
  @ApiOperation({ summary: 'List staff of the garage (search: name, email, phone)' })
  @ApiEnvelope(StaffDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListStaffQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<StaffDto>> {
    const result = await this.staffService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Get(':staff_id')
  @Section(EUserModule.STAFF_VIEW)
  @ApiOperation({ summary: 'Get a staff member' })
  @ApiEnvelope(StaffDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('staff_id', UUIDValidationPipe) staffId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<StaffDto>> {
    const result = await this.staffService.findOne(user, staffId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post()
  @Section(EUserModule.STAFF_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a staff account with a temporary password (UC-3)' })
  @ApiEnvelope(StaffDto, { status: HttpStatus.CREATED })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.CONFLICT)
  async create(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateStaffDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<StaffDto>> {
    const result = await this.staffService.create(user, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Patch(':staff_id')
  @Section(EUserModule.STAFF_MANAGE)
  @ApiOperation({ summary: 'Update name, phone or role (role change ends their sessions)' })
  @ApiEnvelope(StaffDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async update(
    @CurrentUser() user: IAuthUser,
    @Param('staff_id', UUIDValidationPipe) staffId: string,
    @Body() dto: UpdateStaffDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<StaffDto>> {
    const result = await this.staffService.update(user, staffId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch(':staff_id/status')
  @Section(EUserModule.STAFF_MANAGE)
  @ApiOperation({ summary: 'Deactivate or reactivate a staff member (ends sessions)' })
  @ApiEnvelope(StaffDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('staff_id', UUIDValidationPipe) staffId: string,
    @Body() dto: UpdateRecordStatusDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<StaffDto>> {
    const result = await this.staffService.updateStatus(user, staffId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':staff_id/reset-password')
  @Section(EUserModule.STAFF_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new temporary password (forces change on next login)' })
  @ApiEnvelope(StaffDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async resetPassword(
    @CurrentUser() user: IAuthUser,
    @Param('staff_id', UUIDValidationPipe) staffId: string,
    @Body() dto: ResetStaffPasswordDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<StaffDto>> {
    const result = await this.staffService.resetPassword(user, staffId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
