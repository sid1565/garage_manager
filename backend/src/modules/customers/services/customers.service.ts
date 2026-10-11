import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { UpdateRecordStatusDto } from '../../../common/dto/update-record-status.dto';
import { NotificationChannel, RecordStatus } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { TERMINAL_JOB_STATUSES } from '../../job-cards/enums/job-card-status.enum';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import {
  CreateCustomerDto,
  CustomerCreateResultDto,
  CustomerDetailDto,
  CustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from '../dto/customer.dto';
import { Customer } from '../entities/customer.entity';

const ORDER_COLUMNS = new Map([
  ['createdAt', 'c.createdAt'],
  ['name', 'c.name'],
]);
const PHONE_UNIQUE = 'UQ_customers_garage_phone';

const toCustomerDto = (c: Customer, vehicleCount: number): CustomerDto => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  address: c.address,
  preferredChannels: c.preferredChannels,
  notes: c.notes,
  status: c.status,
  vehicleCount,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/** UC-4/6/7. tenant:same-garage on every read and write (other garage → 404). */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
    private readonly auditService: AuditService,
  ) {}

  async list(
    user: IAuthUser,
    query: ListCustomersQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<CustomerDto>>> {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.garage_id = :garageId', { garageId: requireGarageId(user) })
      .andWhere('c.status = :status', { status: query.status ?? RecordStatus.ACTIVE });
    if (query.search) {
      qb.andWhere('(c.name ILIKE :term OR c.phone ILIKE :term OR c.email ILIKE :term)', {
        term: likeTerm(query.search),
      });
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['c.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    const counts = await this.vehicleCounts(rows.map((c) => c.id));
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('CUSTOMER', this.i18n, lang),
      data: { items: rows.map((c) => toCustomerDto(c, counts.get(c.id) ?? 0)), total },
    };
  }

  async findOne(
    user: IAuthUser,
    customerId: string,
    lang: string,
  ): Promise<IServiceResult<CustomerDetailDto>> {
    const garageId = requireGarageId(user);
    const customer = await this.findInGarage(this.customerRepo, garageId, customerId);
    const vehicles = await this.vehicleRepo.find({
      where: { garageId, customerId },
      order: { createdAt: 'DESC' },
    });
    return {
      message: SUCCESS.RECORD_FETCHED('CUSTOMER', this.i18n, lang),
      data: {
        ...toCustomerDto(customer, vehicles.length),
        vehicles: vehicles.map((v) => ({
          id: v.id,
          registrationNumber: v.registrationNumber,
          make: v.make,
          model: v.model,
          status: v.status,
        })),
      },
    };
  }

  /** AC-4.2: same phone in this garage → existing customer, duplicate=true (no new row). */
  async create(
    user: IAuthUser,
    dto: CreateCustomerDto,
    lang: string,
  ): Promise<IServiceResult<CustomerCreateResultDto>> {
    const garageId = requireGarageId(user);
    this.assertChannelsUsable(dto.preferredChannels, dto.email);

    const existing = await this.customerRepo.findOne({ where: { garageId, phone: dto.phone } });
    if (existing) return this.duplicateResult(existing, lang);

    try {
      const created = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Customer);
        const customer = await repo.save(
          repo.create({
            garageId,
            name: dto.name.trim(),
            phone: dto.phone,
            email: dto.email?.trim().toLowerCase() ?? null,
            address: dto.address ?? null,
            preferredChannels: dto.preferredChannels,
            notes: dto.notes ?? null,
          }),
        );
        await this.audit(manager, user, AUDIT_ACTIONS.CUSTOMER_CREATED, customer.id, null);
        return customer;
      });
      return {
        message: SUCCESS.RECORD_CREATED('CUSTOMER', this.i18n, lang),
        data: { ...toCustomerDto(created, 0), duplicate: false },
      };
    } catch (error) {
      // Lost a race with a concurrent create of the same phone.
      if (!isUniqueViolation(error, PHONE_UNIQUE)) throw error;
      const winner = await this.customerRepo.findOneOrFail({
        where: { garageId, phone: dto.phone },
      });
      return this.duplicateResult(winner, lang);
    }
  }

  async update(
    user: IAuthUser,
    customerId: string,
    dto: UpdateCustomerDto,
    lang: string,
  ): Promise<IServiceResult<CustomerDto>> {
    const garageId = requireGarageId(user);
    try {
      const updated = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Customer);
        const customer = await this.findInGarage(repo, garageId, customerId, true);
        const before = { name: customer.name, phone: customer.phone, email: customer.email };
        if (dto.name !== undefined) customer.name = dto.name.trim();
        if (dto.phone !== undefined) customer.phone = dto.phone;
        if (dto.email !== undefined) customer.email = dto.email.trim().toLowerCase();
        if (dto.address !== undefined) customer.address = dto.address;
        if (dto.notes !== undefined) customer.notes = dto.notes;
        if (dto.preferredChannels !== undefined) customer.preferredChannels = dto.preferredChannels;
        this.assertChannelsUsable(customer.preferredChannels, customer.email);
        const saved = await repo.save(customer);
        await this.audit(manager, user, AUDIT_ACTIONS.CUSTOMER_UPDATED, customerId, {
          before,
          after: { name: saved.name, phone: saved.phone, email: saved.email },
        });
        return saved;
      });
      const counts = await this.vehicleCounts([customerId]);
      return {
        message: SUCCESS.RECORD_UPDATED('CUSTOMER', this.i18n, lang),
        data: toCustomerDto(updated, counts.get(customerId) ?? 0),
      };
    } catch (error) {
      if (isUniqueViolation(error, PHONE_UNIQUE)) throw apiError('PHONE_ALREADY_EXISTS');
      throw error;
    }
  }

  /** UC-7: can't deactivate while any of their vehicles has an open job (409 HAS_OPEN_JOB). */
  async updateStatus(
    user: IAuthUser,
    customerId: string,
    dto: UpdateRecordStatusDto,
    lang: string,
  ): Promise<IServiceResult<CustomerDto>> {
    const garageId = requireGarageId(user);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Customer);
      const customer = await this.findInGarage(repo, garageId, customerId, true);
      if (customer.status === dto.status) return customer;
      if (dto.status === RecordStatus.INACTIVE) {
        const openJobs = await manager
          .getRepository(JobCard)
          .createQueryBuilder('j')
          .innerJoin(Vehicle, 'v', 'v.id = j.vehicle_id')
          .where('v.customer_id = :customerId', { customerId })
          .andWhere('j.status NOT IN (:...terminal)', { terminal: TERMINAL_JOB_STATUSES })
          .getCount();
        if (openJobs > 0) throw apiError('HAS_OPEN_JOB');
      }
      const before = customer.status;
      customer.status = dto.status;
      const saved = await repo.save(customer);
      await this.audit(manager, user, AUDIT_ACTIONS.CUSTOMER_STATUS_CHANGED, customerId, {
        before: { status: before },
        after: { status: dto.status },
      });
      return saved;
    });
    const counts = await this.vehicleCounts([customerId]);
    return {
      message: SUCCESS.RECORD_UPDATED('CUSTOMER', this.i18n, lang),
      data: toCustomerDto(updated, counts.get(customerId) ?? 0),
    };
  }

  private async duplicateResult(
    customer: Customer,
    lang: string,
  ): Promise<IServiceResult<CustomerCreateResultDto>> {
    const counts = await this.vehicleCounts([customer.id]);
    return {
      message: SUCCESS.RECORD_FETCHED('CUSTOMER', this.i18n, lang),
      data: { ...toCustomerDto(customer, counts.get(customer.id) ?? 0), duplicate: true },
    };
  }

  private assertChannelsUsable(
    channels: NotificationChannel[],
    email: string | null | undefined,
  ): void {
    if (channels.includes(NotificationChannel.EMAIL) && !email) {
      throw apiError('EMAIL_REQUIRED_FOR_CHANNEL');
    }
  }

  private async vehicleCounts(customerIds: string[]): Promise<Map<string, number>> {
    if (customerIds.length === 0) return new Map();
    const rows: { customer_id: string; count: string }[] = await this.vehicleRepo
      .createQueryBuilder('v')
      .select('v.customer_id', 'customer_id')
      .addSelect('COUNT(*)', 'count')
      .where({ customerId: In(customerIds), status: Not(RecordStatus.INACTIVE) })
      .groupBy('v.customer_id')
      .getRawMany();
    return new Map(rows.map((r) => [r.customer_id, Number(r.count)]));
  }

  private async findInGarage(
    repo: Repository<Customer>,
    garageId: string,
    customerId: string,
    lock = false,
  ): Promise<Customer> {
    const customer = await repo.findOne({
      where: { id: customerId, garageId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!customer) throw apiError('NOT_FOUND');
    return customer;
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    customerId: string,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'customer',
        entityId: customerId,
        changes,
      },
      manager,
    );
  }
}
