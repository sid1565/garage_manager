import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { UpdateRecordStatusDto } from '../../../common/dto/update-record-status.dto';
import { RecordStatus } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { normalizeRegistrationNumber } from '../../../common/utils/registration.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { Customer } from '../../customers/entities/customer.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { Problem } from '../../job-cards/entities/problem.entity';
import { TERMINAL_JOB_STATUSES } from '../../job-cards/enums/job-card-status.enum';
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
import { Vehicle } from '../entities/vehicle.entity';

const ORDER_COLUMNS = new Map([
  ['createdAt', 'v.createdAt'],
  ['registrationNumber', 'v.registrationNumber'],
  ['nextServiceDate', 'v.nextServiceDate'],
]);
const REGISTRATION_UNIQUE = 'UQ_vehicles_garage_registration';

const toVehicleDto = (v: Vehicle, owner: Customer): VehicleDto => ({
  id: v.id,
  registrationNumber: v.registrationNumber,
  vin: v.vin,
  make: v.make,
  model: v.model,
  variant: v.variant,
  manufactureYear: v.manufactureYear,
  fuelType: v.fuelType,
  color: v.color,
  odometerKm: v.odometerKm,
  nextServiceDate: v.nextServiceDate,
  status: v.status,
  owner: { id: owner.id, name: owner.name, phone: owner.phone },
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

/** UC-5/6/7. tenant:same-garage on vehicles AND on the customers they're linked to. */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(JobCard) private readonly jobCardRepo: Repository<JobCard>,
    @InjectRepository(Problem) private readonly problemRepo: Repository<Problem>,
    private readonly auditService: AuditService,
  ) {}

  /** Search: partial registration (trigram index; spaces ignored), owner name or phone. */
  async list(
    user: IAuthUser,
    query: ListVehiclesQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<VehicleDto>>> {
    const qb = this.vehicleRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.customer', 'c')
      .where('v.garage_id = :garageId', { garageId: requireGarageId(user) })
      .andWhere('v.status = :status', { status: query.status ?? RecordStatus.ACTIVE });
    if (query.customerId)
      qb.andWhere('v.customer_id = :customerId', { customerId: query.customerId });
    if (query.fuelType) qb.andWhere('v.fuel_type = :fuelType', { fuelType: query.fuelType });
    if (query.serviceDueBefore) {
      qb.andWhere('v.next_service_date <= :due', { due: query.serviceDueBefore });
    }
    if (query.search) {
      const registration = normalizeRegistrationNumber(query.search);
      qb.andWhere(
        `(${registration ? 'v.registration_number LIKE :reg OR ' : ''}c.name ILIKE :term OR c.phone ILIKE :term)`,
        { reg: likeTerm(registration), term: likeTerm(query.search) },
      );
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['v.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('VEHICLE', this.i18n, lang),
      data: { items: rows.map((v) => toVehicleDto(v, v.customer)), total },
    };
  }

  async findOne(
    user: IAuthUser,
    vehicleId: string,
    lang: string,
  ): Promise<IServiceResult<VehicleDetailDto>> {
    const vehicle = await this.findInGarage(this.vehicleRepo, requireGarageId(user), vehicleId);
    const openJob = await this.jobCardRepo.findOne({
      where: { vehicleId, status: Not(In([...TERMINAL_JOB_STATUSES])) },
    });
    return {
      message: SUCCESS.RECORD_FETCHED('VEHICLE', this.i18n, lang),
      data: {
        ...toVehicleDto(vehicle, vehicle.customer),
        openJobCard: openJob
          ? {
              id: openJob.id,
              jobNumber: openJob.jobNumber,
              status: openJob.status,
              createdAt: openJob.createdAt,
            }
          : null,
      },
    };
  }

  /** AC-6.3: every job of the vehicle, newest first, with invoice totals and problem titles. */
  async serviceHistory(
    user: IAuthUser,
    vehicleId: string,
    query: ServiceHistoryQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<ServiceHistoryItemDto>>> {
    const garageId = requireGarageId(user);
    await this.findInGarage(this.vehicleRepo, garageId, vehicleId);
    const qb = this.jobCardRepo
      .createQueryBuilder('j')
      .leftJoin(Invoice, 'i', 'i.job_card_id = j.id')
      .addSelect('i.invoice_number', 'invoice_number')
      .addSelect('i.total', 'invoice_total')
      .where('j.vehicle_id = :vehicleId AND j.garage_id = :garageId', { vehicleId, garageId })
      .orderBy('j.created_at', query.order.createdAt === 'ASC' ? 'ASC' : 'DESC')
      .offset(query.offset)
      .limit(query.limit);
    const [{ entities, raw }, total] = await Promise.all([
      qb.getRawAndEntities<{ invoice_number: string | null; invoice_total: string | null }>(),
      qb.getCount(),
    ]);
    const problems = entities.length
      ? await this.problemRepo.find({
          where: { jobCardId: In(entities.map((j) => j.id)) },
          select: { jobCardId: true, title: true },
          order: { createdAt: 'ASC' },
        })
      : [];
    const items = entities.map((j, index) => ({
      jobCardId: j.id,
      jobNumber: j.jobNumber,
      status: j.status,
      checkinOdometerKm: j.checkinOdometerKm,
      customerComplaints: j.customerComplaints,
      problemTitles: problems.filter((p) => p.jobCardId === j.id).map((p) => p.title),
      invoiceNumber: raw.at(index)?.invoice_number ?? null,
      invoiceTotal: raw.at(index)?.invoice_total ?? null,
      createdAt: j.createdAt,
      closedAt: j.closedAt,
    }));
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('VEHICLE', this.i18n, lang),
      data: { items, total },
    };
  }

  async create(
    user: IAuthUser,
    dto: CreateVehicleDto,
    lang: string,
  ): Promise<IServiceResult<VehicleDto>> {
    const garageId = requireGarageId(user);
    try {
      const { vehicle, owner } = await this.dataSource.transaction(async (manager) => {
        const owner = await this.findActiveCustomer(manager, garageId, dto.customerId);
        const repo = manager.getRepository(Vehicle);
        const vehicle = await repo.save(
          repo.create({
            garageId,
            customerId: owner.id,
            registrationNumber: normalizeRegistrationNumber(dto.registrationNumber),
            vin: dto.vin?.toUpperCase() ?? null,
            make: dto.make.trim(),
            model: dto.model.trim(),
            variant: dto.variant ?? null,
            manufactureYear: dto.manufactureYear ?? null,
            fuelType: dto.fuelType,
            color: dto.color ?? null,
            odometerKm: dto.odometerKm ?? 0,
            nextServiceDate: dto.nextServiceDate ?? null,
          }),
        );
        await this.audit(manager, user, AUDIT_ACTIONS.VEHICLE_CREATED, vehicle.id, {
          after: { registrationNumber: vehicle.registrationNumber, customerId: owner.id },
        });
        return { vehicle, owner };
      });
      return {
        message: SUCCESS.RECORD_CREATED('VEHICLE', this.i18n, lang),
        data: toVehicleDto(vehicle, owner),
      };
    } catch (error) {
      if (isUniqueViolation(error, REGISTRATION_UNIQUE)) throw apiError('REGISTRATION_EXISTS');
      throw error;
    }
  }

  async update(
    user: IAuthUser,
    vehicleId: string,
    dto: UpdateVehicleDto,
    lang: string,
  ): Promise<IServiceResult<VehicleDto>> {
    const garageId = requireGarageId(user);
    try {
      const vehicle = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Vehicle);
        const vehicle = await this.findInGarage(repo, garageId, vehicleId, true);
        if (dto.odometerKm !== undefined && dto.odometerKm < vehicle.odometerKm) {
          throw apiError('ODOMETER_DECREASED');
        }
        const before = {
          registrationNumber: vehicle.registrationNumber,
          odometerKm: vehicle.odometerKm,
        };
        if (dto.registrationNumber !== undefined) {
          vehicle.registrationNumber = normalizeRegistrationNumber(dto.registrationNumber);
        }
        if (dto.vin !== undefined) vehicle.vin = dto.vin.toUpperCase();
        if (dto.make !== undefined) vehicle.make = dto.make.trim();
        if (dto.model !== undefined) vehicle.model = dto.model.trim();
        if (dto.variant !== undefined) vehicle.variant = dto.variant;
        if (dto.manufactureYear !== undefined) vehicle.manufactureYear = dto.manufactureYear;
        if (dto.fuelType !== undefined) vehicle.fuelType = dto.fuelType;
        if (dto.color !== undefined) vehicle.color = dto.color;
        if (dto.odometerKm !== undefined) vehicle.odometerKm = dto.odometerKm;
        if (dto.nextServiceDate !== undefined) vehicle.nextServiceDate = dto.nextServiceDate;
        const saved = await repo.save(vehicle);
        await this.audit(manager, user, AUDIT_ACTIONS.VEHICLE_UPDATED, vehicleId, {
          before,
          after: { registrationNumber: saved.registrationNumber, odometerKm: saved.odometerKm },
        });
        return saved;
      });
      return {
        message: SUCCESS.RECORD_UPDATED('VEHICLE', this.i18n, lang),
        data: toVehicleDto(vehicle, vehicle.customer),
      };
    } catch (error) {
      if (isUniqueViolation(error, REGISTRATION_UNIQUE)) throw apiError('REGISTRATION_EXISTS');
      throw error;
    }
  }

  /** AC-7.1: a vehicle with an open job can't be deactivated. */
  async updateStatus(
    user: IAuthUser,
    vehicleId: string,
    dto: UpdateRecordStatusDto,
    lang: string,
  ): Promise<IServiceResult<VehicleDto>> {
    const garageId = requireGarageId(user);
    const vehicle = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Vehicle);
      const vehicle = await this.findInGarage(repo, garageId, vehicleId, true);
      if (vehicle.status === dto.status) return vehicle;
      if (dto.status === RecordStatus.INACTIVE) {
        const open = await manager.getRepository(JobCard).count({
          where: { vehicleId, status: Not(In([...TERMINAL_JOB_STATUSES])) },
        });
        if (open > 0) throw apiError('HAS_OPEN_JOB');
      }
      const before = vehicle.status;
      vehicle.status = dto.status;
      const saved = await repo.save(vehicle);
      await this.audit(manager, user, AUDIT_ACTIONS.VEHICLE_STATUS_CHANGED, vehicleId, {
        before: { status: before },
        after: { status: dto.status },
      });
      return saved;
    });
    return {
      message: SUCCESS.RECORD_UPDATED('VEHICLE', this.i18n, lang),
      data: toVehicleDto(vehicle, vehicle.customer),
    };
  }

  /** AC-7.2: new owner must be an ACTIVE customer of the same garage, else 404. */
  async transfer(
    user: IAuthUser,
    vehicleId: string,
    dto: TransferVehicleDto,
    lang: string,
  ): Promise<IServiceResult<VehicleDto>> {
    const garageId = requireGarageId(user);
    const { vehicle, owner } = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Vehicle);
      const vehicle = await this.findInGarage(repo, garageId, vehicleId, true);
      const owner = await this.findActiveCustomer(manager, garageId, dto.customerId);
      if (vehicle.customerId === owner.id) return { vehicle, owner };
      const previousOwnerId = vehicle.customerId;
      vehicle.customerId = owner.id;
      vehicle.customer = owner;
      const saved = await repo.save(vehicle);
      await this.audit(manager, user, AUDIT_ACTIONS.VEHICLE_TRANSFERRED, vehicleId, {
        before: { customerId: previousOwnerId },
        after: { customerId: owner.id },
      });
      return { vehicle: saved, owner };
    });
    return {
      message: SUCCESS.RECORD_UPDATED('VEHICLE', this.i18n, lang),
      data: toVehicleDto(vehicle, owner),
    };
  }

  private async findActiveCustomer(
    manager: EntityManager,
    garageId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await manager.getRepository(Customer).findOne({
      where: { id: customerId, garageId, status: RecordStatus.ACTIVE },
    });
    if (!customer) throw apiError('NOT_FOUND');
    return customer;
  }

  /** Loads the vehicle with its owner; the row lock (when requested) covers the vehicle only. */
  private async findInGarage(
    repo: Repository<Vehicle>,
    garageId: string,
    vehicleId: string,
    lock = false,
  ): Promise<Vehicle> {
    if (lock) {
      const locked = await repo.findOne({
        where: { id: vehicleId, garageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw apiError('NOT_FOUND');
    }
    const vehicle = await repo.findOne({
      where: { id: vehicleId, garageId },
      relations: { customer: true },
    });
    if (!vehicle) throw apiError('NOT_FOUND');
    return vehicle;
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    vehicleId: string,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'vehicle',
        entityId: vehicleId,
        changes,
      },
      manager,
    );
  }
}
