import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, In, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { RecordStatus, UserRole } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { User } from '../../staff/entities/user.entity';
import { ListGaragesQueryDto, UpdateGarageStatusDto } from '../dto/admin-garage.dto';
import { AdminGarageListItemDto, GarageDto } from '../dto/garage-response.dto';
import { UpdateGarageDto } from '../dto/update-garage.dto';
import { Garage } from '../entities/garage.entity';

const ORDER_COLUMNS = new Map([
  ['createdAt', 'g.createdAt'],
  ['name', 'g.name'],
]);

export const toGarageDto = (g: Garage): GarageDto => ({
  id: g.id,
  name: g.name,
  addressLine: g.addressLine,
  city: g.city,
  state: g.state,
  postalCode: g.postalCode,
  phone: g.phone,
  email: g.email,
  taxRegistrationNumber: g.taxRegistrationNumber,
  currency: g.currency,
  taxRate: g.taxRate,
  timezone: g.timezone,
  status: g.status,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
});

@Injectable()
export class GaragesService {
  private readonly logger = new Logger(GaragesService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Garage) private readonly garageRepo: Repository<Garage>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  /** tenant:same-garage — the garage comes from the token, never from input. */
  async getCurrent(user: IAuthUser, lang: string): Promise<IServiceResult<GarageDto>> {
    const garage = await this.findGarageOrFail(requireGarageId(user));
    return {
      message: SUCCESS.RECORD_FETCHED('GARAGE', this.i18n, lang),
      data: toGarageDto(garage),
    };
  }

  async updateCurrent(
    user: IAuthUser,
    dto: UpdateGarageDto,
    lang: string,
  ): Promise<IServiceResult<GarageDto>> {
    const garageId = requireGarageId(user);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Garage);
      const garage = await repo.findOne({
        where: { id: garageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!garage) throw apiError('NOT_FOUND');
      const before = this.pick(garage, Object.keys(dto));
      repo.merge(garage, dto);
      const saved = await repo.save(garage);
      await this.auditService.record(
        {
          garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.GARAGE_UPDATED,
          entityType: 'garage',
          entityId: garageId,
          changes: { before, after: this.pick(saved, Object.keys(dto)) },
        },
        manager,
      );
      return saved;
    });
    return {
      message: SUCCESS.RECORD_UPDATED('GARAGE', this.i18n, lang),
      data: toGarageDto(updated),
    };
  }

  /** platform-only (EAdminModule.GARAGE_MANAGEMENT): every garage, with staff stats. */
  async listAll(
    _user: IAuthUser,
    query: ListGaragesQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<AdminGarageListItemDto>>> {
    const qb = this.garageRepo.createQueryBuilder('g');
    if (query.status) qb.andWhere('g.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(g.name ILIKE :term OR g.phone ILIKE :term OR g.email ILIKE :term)', {
        term: likeTerm(query.search),
      });
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['g.createdAt', 'DESC']);
    const [garages, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();

    const ids = garages.map((g) => g.id);
    const staff = ids.length
      ? await this.userRepo.find({
          where: { garageId: In(ids) },
          select: { garageId: true, email: true, role: true, status: true, createdAt: true },
          order: { createdAt: 'ASC' },
        })
      : [];
    const items = garages.map((g) => {
      const mine = staff.filter((u) => u.garageId === g.id);
      return {
        ...toGarageDto(g),
        activeStaffCount: mine.filter((u) => u.status === RecordStatus.ACTIVE).length,
        adminEmail: mine.find((u) => u.role === UserRole.GARAGE_ADMIN)?.email ?? null,
      };
    });
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('GARAGE', this.i18n, lang),
      data: { items, total },
    };
  }

  /** UC-19. Takes effect immediately: UserAuthGuard re-checks garage status per request. */
  async updateStatus(
    user: IAuthUser,
    garageId: string,
    dto: UpdateGarageStatusDto,
    lang: string,
  ): Promise<IServiceResult<GarageDto>> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Garage);
      const garage = await repo.findOne({
        where: { id: garageId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!garage) throw apiError('NOT_FOUND');
      const before = garage.status;
      garage.status = dto.status;
      const saved = await repo.save(garage);
      await this.auditService.record(
        {
          garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.GARAGE_STATUS_CHANGED,
          entityType: 'garage',
          entityId: garageId,
          changes: {
            before: { status: before },
            after: { status: dto.status },
            reason: dto.reason,
          },
        },
        manager,
      );
      return saved;
    });
    this.logger.log(`Garage ${garageId} status → ${dto.status} by platform admin ${user.id}`);
    return {
      message: SUCCESS.RECORD_UPDATED('GARAGE', this.i18n, lang),
      data: toGarageDto(updated),
    };
  }

  private async findGarageOrFail(garageId: string): Promise<Garage> {
    const garage = await this.garageRepo.findOne({ where: { id: garageId } });
    if (!garage) throw apiError('NOT_FOUND');
    return garage;
  }

  private pick(garage: Garage, keys: string[]): Record<string, unknown> {
    const source = new Map(Object.entries(garage));
    return Object.fromEntries(keys.map((k) => [k, source.get(k)]));
  }
}
