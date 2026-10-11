import { Body, Controller, Get, Headers, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { GarageDto } from '../dto/garage-response.dto';
import { UpdateGarageDto } from '../dto/update-garage.dto';
import { GaragesService } from '../services/garages.service';

/** The caller's own garage. UserAuthGuard + SectionGuard are global (APP_GUARD). */
@ApiTags('Garage')
@ApiBearerAuth()
@Controller('garages')
export class GaragesController {
  constructor(private readonly garagesService: GaragesService) {}

  @Get('current')
  @Section(EUserModule.GARAGE_PROFILE_VIEW)
  @ApiOperation({ summary: "Get the current user's garage profile and settings" })
  @ApiEnvelope(GarageDto)
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async getCurrent(
    @CurrentUser() user: IAuthUser,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<GarageDto>> {
    const result = await this.garagesService.getCurrent(user, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch('current')
  @Section(EUserModule.GARAGE_PROFILE_MANAGE)
  @ApiOperation({ summary: 'Update garage profile, tax rate, currency, timezone' })
  @ApiEnvelope(GarageDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async updateCurrent(
    @CurrentUser() user: IAuthUser,
    @Body() dto: UpdateGarageDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<GarageDto>> {
    const result = await this.garagesService.updateCurrent(user, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
