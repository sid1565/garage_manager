import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiEnvelope, ApiErrors, CurrentUser, Section } from '../../../common/decorators';
import { UpdateRecordStatusDto } from '../../../common/dto/update-record-status.dto';
import { EUserModule } from '../../../common/enums';
import { ResponseHelper } from '../../../common/helpers/response.helper';
import { IApiResponse, IAuthUser, IPaginatedResponse } from '../../../common/interfaces';
import { UUIDValidationPipe } from '../../../common/pipes/uuid-validation.pipe';
import {
  CreateCustomerDto,
  CustomerCreateResultDto,
  CustomerDetailDto,
  CustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from '../dto/customer.dto';
import { CustomersService } from '../services/customers.service';

const PROTECTED_ERRORS = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Section(EUserModule.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Search customers (name, phone, email) — UC-6' })
  @ApiEnvelope(CustomerDto, { paginated: true })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async list(
    @CurrentUser() user: IAuthUser,
    @Query() query: ListCustomersQueryDto,
    @Headers('accept-language') lang: string,
  ): Promise<IPaginatedResponse<CustomerDto>> {
    const result = await this.customersService.list(user, query, lang);
    return ResponseHelper.paginatedSuccess(
      result.message,
      { limit: query.limit, offset: query.offset, total: result.data.total },
      result.data.items,
    );
  }

  @Get(':customer_id')
  @Section(EUserModule.CUSTOMERS_VIEW)
  @ApiOperation({ summary: 'Get a customer with their vehicles' })
  @ApiEnvelope(CustomerDetailDto)
  @ApiErrors(...PROTECTED_ERRORS, HttpStatus.NOT_FOUND)
  async findOne(
    @CurrentUser() user: IAuthUser,
    @Param('customer_id', UUIDValidationPipe) customerId: string,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<CustomerDetailDto>> {
    const result = await this.customersService.findOne(user, customerId, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  /** 201 when created; 200 + duplicate=true when the phone already exists in this garage (AC-4.2). */
  @Post()
  @Section(EUserModule.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Register a vehicle owner — UC-4 (dedupes by phone)' })
  @ApiEnvelope(CustomerCreateResultDto, { status: HttpStatus.CREATED })
  @ApiEnvelope(CustomerCreateResultDto, {
    status: HttpStatus.OK,
    description: 'Existing customer with the same phone (duplicate: true)',
  })
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS)
  async create(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateCustomerDto,
    @Headers('accept-language') lang: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IApiResponse<CustomerCreateResultDto>> {
    const result = await this.customersService.create(user, dto, lang);
    const status = result.data.duplicate ? HttpStatus.OK : HttpStatus.CREATED;
    res.status(status);
    return ResponseHelper.success(result.message, result.data, status);
  }

  @Patch(':customer_id')
  @Section(EUserModule.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Update a customer — UC-7' })
  @ApiEnvelope(CustomerDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async update(
    @CurrentUser() user: IAuthUser,
    @Param('customer_id', UUIDValidationPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<CustomerDto>> {
    const result = await this.customersService.update(user, customerId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }

  @Patch(':customer_id/status')
  @Section(EUserModule.CUSTOMERS_MANAGE)
  @ApiOperation({ summary: 'Deactivate or reactivate a customer — UC-7' })
  @ApiEnvelope(CustomerDto)
  @ApiErrors(HttpStatus.BAD_REQUEST, ...PROTECTED_ERRORS, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT)
  async updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('customer_id', UUIDValidationPipe) customerId: string,
    @Body() dto: UpdateRecordStatusDto,
    @Headers('accept-language') lang: string,
  ): Promise<IApiResponse<CustomerDto>> {
    const result = await this.customersService.updateStatus(user, customerId, dto, lang);
    return ResponseHelper.success(result.message, result.data);
  }
}
