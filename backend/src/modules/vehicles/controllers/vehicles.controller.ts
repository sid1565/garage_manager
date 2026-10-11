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
  CreateVehicleDto,
  ListVehiclesQueryDto,
  ServiceHistoryItemDto,
  ServiceHistoryQueryDto,
  TransferVehicleDto,
  UpdateVehicleDto,
  VehicleDetailDto,
  VehicleDto,
} from '../dto/vehicle.dto';
import { VehiclesService } from '../services/vehicles.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Section(EUserModule.VEHICLES_VIEW)
  @ApiOperation({ summary: 'Search vehicles (registration, owner name/phone) — UC-6' })
  @ApiEnvelope(VehicleDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListVehiclesQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<VehicleDto>> {
    const result = await this.vehiclesService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Get(':vehicle_id')
  @Section(EUserModule.VEHICLES_VIEW)
  @ApiOperation({ summary: 'Get a vehicle with owner and open job card' })
  @ApiEnvelope(VehicleDetailDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('vehicle_id', UUIDValidationPipe) vehicleId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<VehicleDetailDto>> {
    const result = await this.vehiclesService.findOne(user, vehicleId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Get(':vehicle_id/service-history')
  @Section(EUserModule.VEHICLES_VIEW)
  @ApiOperation({ summary: 'Past job cards with invoice totals — AC-6.3' })
  @ApiEnvelope(ServiceHistoryItemDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async serviceHistory(
    @CurrentUser() user: IAuthUser,
    @Param('vehicle_id', UUIDValidationPipe) vehicleId: string,
    @Query() query: ServiceHistoryQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<ServiceHistoryItemDto>> {
    const result = await this.vehiclesService.serviceHistory(user, vehicleId, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Post()
  @Section(EUserModule.VEHICLES_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a vehicle to a customer — UC-5' })
  @ApiEnvelope(VehicleDto, { status: HttpStatus.CREATED })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async create(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateVehicleDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<VehicleDto>> {
    const result = await this.vehiclesService.create(user, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Patch(':vehicle_id')
  @Section(EUserModule.VEHICLES_MANAGE)
  @ApiOperation({ summary: 'Update vehicle details — UC-7' })
  @ApiEnvelope(VehicleDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async update(
    @CurrentUser() user: IAuthUser,
    @Param('vehicle_id', UUIDValidationPipe) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<VehicleDto>> {
    const result = await this.vehiclesService.update(user, vehicleId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch(':vehicle_id/status')
  @Section(EUserModule.VEHICLES_MANAGE)
  @ApiOperation({ summary: 'Deactivate or reactivate a vehicle — AC-7.1' })
  @ApiEnvelope(VehicleDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('vehicle_id', UUIDValidationPipe) vehicleId: string,
    @Body() dto: UpdateRecordStatusDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<VehicleDto>> {
    const result = await this.vehiclesService.updateStatus(user, vehicleId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post(':vehicle_id/transfer')
  @Section(EUserModule.VEHICLES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer to another customer in the same garage — AC-7.2' })
  @ApiEnvelope(VehicleDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async transfer(
    @CurrentUser() user: IAuthUser,
    @Param('vehicle_id', UUIDValidationPipe) vehicleId: string,
    @Body() dto: TransferVehicleDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<VehicleDto>> {
    const result = await this.vehiclesService.transfer(user, vehicleId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
