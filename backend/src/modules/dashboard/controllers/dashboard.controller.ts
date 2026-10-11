import { Controller, Get, Headers, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser } from '../../../common/interfaces';
import { DashboardSummaryDto } from '../dto/dashboard.dto';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Section(EUserModule.DASHBOARD_VIEW)
  @ApiOperation({
    summary: 'Job queue counts, top problem categories, revenue (UC-17)',
    description: '`revenue` is included only for roles with DASHBOARD_REVENUE (garage admin).',
  })
  @ApiEnvelope(DashboardSummaryDto)
  @ApiErrors(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async summary(
    @CurrentUser() user: IAuthUser,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<DashboardSummaryDto>> {
    const result = await this.dashboardService.summary(user, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
