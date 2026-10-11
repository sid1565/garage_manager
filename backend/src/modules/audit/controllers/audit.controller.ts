import { Controller, Get, Headers, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { AuditLogDto, ListAuditLogsQueryDto } from '../dto/audit-log.dto';
import { AuditQueryService } from '../services/audit-query.service';

@ApiTags('Audit Log')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditQueryService: AuditQueryService) {}

  @Get()
  @Section(EUserModule.AUDIT_LOG_VIEW)
  @ApiOperation({ summary: "The garage's audit trail (NFR-7)" })
  @ApiEnvelope(AuditLogDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListAuditLogsQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<AuditLogDto>> {
    const result = await this.auditQueryService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }
}
