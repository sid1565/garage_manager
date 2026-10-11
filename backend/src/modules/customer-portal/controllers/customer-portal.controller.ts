import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors } from '../../../common/decorators';
import { toStreamableFile } from '../../../common/helpers/download.helper';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import { CurrentCustomerLink } from '../../customer-links/decorators/current-customer-link.decorator';
import { CustomerLinkAccess } from '../../customer-links/decorators/customer-link-access.decorator';
import { LinkPurpose } from '../../customer-links/enums/link-purpose.enum';
import { ICustomerLinkContext } from '../../customer-links/interfaces/customer-link-context.interface';
import { EstimateDecisionDto } from '../../estimates/dto/estimate.dto';
import { PortalEstimateDto, PortalJobViewDto } from '../dto/portal-view.dto';
import { CustomerPortalService } from '../services/customer-portal.service';

/** Errors every link route can return (CustomerLinkGuard + portal throttle). */
const LINK_ERRORS = [
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.GONE,
  HttpStatus.TOO_MANY_REQUESTS,
] as const;

/**
 * Vehicle-owner pages reached from SMS/email links (UC-12). No staff JWT: each route is
 * authenticated by the `:token` path param via @CustomerLinkAccess (link-scoped,
 * 30 req/min per IP). Staff tokens are ignored here.
 */
@ApiTags('Customer Portal (public, link token)')
@Controller('portal/:token')
export class CustomerPortalController {
  constructor(private readonly customerPortalService: CustomerPortalService) {}

  @Get()
  @CustomerLinkAccess(LinkPurpose.VIEW_JOB, LinkPurpose.APPROVE_ESTIMATE)
  @ApiOperation({ summary: 'Job status, problems with photos, estimate (AC-12.1)' })
  @ApiEnvelope(PortalJobViewDto)
  @ApiErrors(...LINK_ERRORS)
  async getJobView(
    @CurrentCustomerLink() link: ICustomerLinkContext,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<PortalJobViewDto>> {
    const result = await this.customerPortalService.getJobView(link, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Get('attachments/:attachment_id')
  @CustomerLinkAccess(LinkPurpose.VIEW_JOB, LinkPurpose.APPROVE_ESTIMATE)
  @ApiOperation({ summary: 'Download a photo of this job' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiErrors(...LINK_ERRORS)
  async downloadAttachment(
    @CurrentCustomerLink() link: ICustomerLinkContext,
    @Param('attachment_id', UUIDValidationPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    return toStreamableFile(
      await this.customerPortalService.downloadAttachment(link, attachmentId),
    );
  }

  @Post('estimate/response')
  @CustomerLinkAccess(LinkPurpose.APPROVE_ESTIMATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject each estimate item (AC-12.2 – 12.4)' })
  @ApiEnvelope(PortalEstimateDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...LINK_ERRORS, HttpStatus.CONFLICT)
  async respondToEstimate(
    @CurrentCustomerLink() link: ICustomerLinkContext,
    @Body() dto: EstimateDecisionDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<PortalEstimateDto>> {
    const result = await this.customerPortalService.respondToEstimate(link, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
