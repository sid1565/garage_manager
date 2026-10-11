import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../../common/decorators';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse } from '../../../common/interfaces';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database connectivity check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check(): Promise<IApiResponse<{ database: 'up' | 'down' }>> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'down';
    }
    return ResponseHelper.success('translation.SUCCESS.HEALTH_OK', { database });
  }
}
