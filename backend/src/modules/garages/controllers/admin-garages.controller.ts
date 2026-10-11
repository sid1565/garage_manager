import { Body, Controller, Get, Headers, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EAdminModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import { ListGaragesQueryDto, UpdateGarageStatusDto } from '../dto/admin-garage.dto';
import { AdminGarageListItemDto, GarageDto } from '../dto/garage-response.dto';
import { GaragesService } from '../services/garages.service';

/** Platform operator console (ACT-6, UC-19). */
@ApiTags('Platform Admin')
@ApiBearerAuth()
@Controller('admin/garages')
export class AdminGaragesController {
  constructor(private readonly garagesService: GaragesService) {}

  @Get()
  @Section(EAdminModule.GARAGE_MANAGEMENT)
  @ApiOperation({ summary: 'List all garages (search: name, phone, email)' })
  @ApiEnvelope(AdminGarageListItemDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListGaragesQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<AdminGarageListItemDto>> {
    const result = await this.garagesService.listAll(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Patch(':garage_id/status')
  @Section(EAdminModule.GARAGE_MANAGEMENT)
  @ApiOperation({ summary: 'Suspend or reactivate a garage (UC-19)' })
  @ApiEnvelope(GarageDto)
  @ApiErrors(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('garage_id', UUIDValidationPipe) garageId: string,
    @Body() dto: UpdateGarageStatusDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<GarageDto>> {
    const result = await this.garagesService.updateStatus(user, garageId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
