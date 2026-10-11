import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import {
  CreateInvoiceDto,
  InvoiceDto,
  InvoiceSummaryDto,
  ListInvoicesQueryDto,
  RecordPaymentDto,
} from '../dto/invoice.dto';
import { InvoicesService } from '../services/invoices.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;
const WRITE_ERRORS = [
  HttpStatus.BAD_REQUEST,
  ...PROTECTED_ERRORS,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
] as const;

@ApiTags('Invoices & Payments')
@ApiBearerAuth()
@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('job-cards/:job_card_id/invoice')
  @Section(EUserModule.INVOICES_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate the invoice from approved work (UC-15)' })
  @ApiEnvelope(InvoiceDto, { status: HttpStatus.CREATED })
  @ApiErrors(...WRITE_ERRORS)
  async create(
    @CurrentUser() user: IAuthUser,
    @Param('job_card_id', UUIDValidationPipe) jobCardId: string,
    @Body() dto: CreateInvoiceDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<InvoiceDto>> {
    const result = await this.invoicesService.create(user, jobCardId, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }

  @Get('invoices')
  @Section(EUserModule.INVOICES_VIEW)
  @ApiOperation({ summary: 'List invoices (search: number, customer, registration)' })
  @ApiEnvelope(InvoiceSummaryDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListInvoicesQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<InvoiceSummaryDto>> {
    const result = await this.invoicesService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Get('invoices/:invoice_id')
  @Section(EUserModule.INVOICES_VIEW)
  @ApiOperation({ summary: 'Invoice with line items and payments' })
  @ApiEnvelope(InvoiceDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('invoice_id', UUIDValidationPipe) invoiceId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<InvoiceDto>> {
    const result = await this.invoicesService.findOne(user, invoiceId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Post('invoices/:invoice_id/payments')
  @Section(EUserModule.PAYMENTS_RECORD)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a payment; returns the updated invoice (UC-15)' })
  @ApiEnvelope(InvoiceDto, { status: HttpStatus.CREATED })
  @ApiErrors(...WRITE_ERRORS)
  async recordPayment(
    @CurrentUser() user: IAuthUser,
    @Param('invoice_id', UUIDValidationPipe) invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<InvoiceDto>> {
    const result = await this.invoicesService.recordPayment(user, invoiceId, dto, lang);
    return ResponseHelper.success(result.message, result.data, HttpStatus.CREATED);
  }
}
