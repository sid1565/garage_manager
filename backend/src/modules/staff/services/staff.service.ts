import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { SUCCESS } from '../../../common/constants/messages';
import { UpdateRecordStatusDto } from '../../../common/dto/update-record-status.dto';
import { RecordStatus, UserRole } from '../../../common/enums';
import { apiError } from '../../../common/helpers/api-error.helper';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { PasswordService } from '../../auth/services/password.service';
import { TokenService } from '../../auth/services/token.service';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  CreateStaffDto,
  GarageRole,
  ListStaffQueryDto,
  ResetStaffPasswordDto,
  StaffDto,
  UpdateStaffDto,
} from '../dto/staff.dto';
import { User } from '../entities/user.entity';

const ORDER_COLUMNS = new Map([
  ['createdAt', 'u.createdAt'],
  ['name', 'u.name'],
]);

const toStaffDto = (u: User): StaffDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role as GarageRole,
  status: u.status,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

/**
 * UC-3. Every query is scoped to requireGarageId(user) (tenant:same-garage) — a staff id
 * from another garage is indistinguishable from a missing one (404). AC-3.4 guard rails
 * (self, last admin) are checked under row locks so two admins can't demote each other
 * concurrently and leave the garage without one.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(
    user: IAuthUser,
    query: ListStaffQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<StaffDto>>> {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.garage_id = :garageId', { garageId: requireGarageId(user) });
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.status) qb.andWhere('u.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(u.name ILIKE :term OR u.email ILIKE :term OR u.phone ILIKE :term)', {
        term: likeTerm(query.search),
      });
    }
    applyOrder(qb, query.order, ORDER_COLUMNS, ['u.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('STAFF', this.i18n, lang),
      data: { items: rows.map(toStaffDto), total },
    };
  }

  async findOne(user: IAuthUser, staffId: string, lang: string): Promise<IServiceResult<StaffDto>> {
    const staff = await this.findInGarage(this.userRepo, requireGarageId(user), staffId);
    return { message: SUCCESS.RECORD_FETCHED('STAFF', this.i18n, lang), data: toStaffDto(staff) };
  }

  async create(
    user: IAuthUser,
    dto: CreateStaffDto,
    lang: string,
  ): Promise<IServiceResult<StaffDto>> {
    const garageId = requireGarageId(user);
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.exist({ where: { email } })) throw apiError('EMAIL_ALREADY_REGISTERED');
    const passwordHash = await this.passwordService.hash(dto.temporaryPassword);

    try {
      const created = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(User);
        const staff = await repo.save(
          repo.create({
            garageId,
            name: dto.name.trim(),
            email,
            phone: dto.phone ?? null,
            role: dto.role,
            passwordHash,
            mustChangePassword: true,
          }),
        );
        await this.audit(manager, user, AUDIT_ACTIONS.STAFF_CREATED, staff.id, {
          after: { name: staff.name, email, role: staff.role },
        });
        // The temporary password is NOT emailed — the admin hands it over directly.
        await this.notificationsService.enqueue(
          {
            garageId,
            type: NotificationType.STAFF_WELCOME,
            recipientEmail: email,
            templateData: { staffName: staff.name, role: staff.role },
            createdById: user.id,
          },
          manager,
        );
        return staff;
      });
      return {
        message: SUCCESS.RECORD_CREATED('STAFF', this.i18n, lang),
        data: toStaffDto(created),
      };
    } catch (error) {
      if (isUniqueViolation(error)) throw apiError('EMAIL_ALREADY_REGISTERED');
      throw error;
    }
  }

  async update(
    user: IAuthUser,
    staffId: string,
    dto: UpdateStaffDto,
    lang: string,
  ): Promise<IServiceResult<StaffDto>> {
    const garageId = requireGarageId(user);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const staff = await this.findInGarage(repo, garageId, staffId, true);
      const roleChanging = dto.role !== undefined && dto.role !== staff.role;
      if (roleChanging) {
        if (staff.id === user.id) throw apiError('CANNOT_DEACTIVATE_SELF');
        await this.assertNotLastAdmin(manager, garageId, staff);
      }
      const before = { name: staff.name, phone: staff.phone, role: staff.role };
      if (dto.name !== undefined) staff.name = dto.name.trim();
      if (dto.phone !== undefined) staff.phone = dto.phone;
      if (dto.role !== undefined) staff.role = dto.role;
      const saved = await repo.save(staff);
      // Role is re-read from the DB on every request; revoking also forces new tokens.
      if (roleChanging) await this.tokenService.revokeAllForUser(staff.id, manager);
      await this.audit(manager, user, AUDIT_ACTIONS.STAFF_UPDATED, staff.id, {
        before,
        after: { name: saved.name, phone: saved.phone, role: saved.role },
      });
      return saved;
    });
    return { message: SUCCESS.RECORD_UPDATED('STAFF', this.i18n, lang), data: toStaffDto(updated) };
  }

  /** AC-3.4 / AC-3.5: deactivation revokes every session immediately. */
  async updateStatus(
    user: IAuthUser,
    staffId: string,
    dto: UpdateRecordStatusDto,
    lang: string,
  ): Promise<IServiceResult<StaffDto>> {
    const garageId = requireGarageId(user);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const staff = await this.findInGarage(repo, garageId, staffId, true);
      if (staff.status === dto.status) return staff;
      if (dto.status === RecordStatus.INACTIVE) {
        if (staff.id === user.id) throw apiError('CANNOT_DEACTIVATE_SELF');
        await this.assertNotLastAdmin(manager, garageId, staff);
      }
      const before = staff.status;
      staff.status = dto.status;
      const saved = await repo.save(staff);
      if (dto.status === RecordStatus.INACTIVE) {
        await this.tokenService.revokeAllForUser(staff.id, manager);
      }
      await this.audit(manager, user, AUDIT_ACTIONS.STAFF_STATUS_CHANGED, staff.id, {
        before: { status: before },
        after: { status: dto.status },
      });
      return saved;
    });
    return { message: SUCCESS.RECORD_UPDATED('STAFF', this.i18n, lang), data: toStaffDto(updated) };
  }

  /** New temporary password: forced change on next login, lockout cleared, sessions revoked. */
  async resetPassword(
    user: IAuthUser,
    staffId: string,
    dto: ResetStaffPasswordDto,
    lang: string,
  ): Promise<IServiceResult<StaffDto>> {
    const garageId = requireGarageId(user);
    const passwordHash = await this.passwordService.hash(dto.temporaryPassword);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const staff = await this.findInGarage(repo, garageId, staffId, true);
      await repo.update(
        { id: staff.id },
        {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      );
      await this.tokenService.revokeAllForUser(staff.id, manager);
      await this.audit(manager, user, AUDIT_ACTIONS.STAFF_PASSWORD_RESET, staff.id, null);
      return { ...staff, mustChangePassword: true };
    });
    return { message: SUCCESS.RECORD_UPDATED('STAFF', this.i18n, lang), data: toStaffDto(updated) };
  }

  /** Demoting/deactivating the last ACTIVE GARAGE_ADMIN would orphan the garage (AC-3.4). */
  private async assertNotLastAdmin(
    manager: EntityManager,
    garageId: string,
    target: User,
  ): Promise<void> {
    if (target.role !== UserRole.GARAGE_ADMIN || target.status !== RecordStatus.ACTIVE) return;
    const admins = await manager.getRepository(User).find({
      where: { garageId, role: UserRole.GARAGE_ADMIN, status: RecordStatus.ACTIVE },
      lock: { mode: 'pessimistic_write' },
    });
    if (admins.length <= 1) throw apiError('LAST_GARAGE_ADMIN');
  }

  private async findInGarage(
    repo: Repository<User>,
    garageId: string,
    staffId: string,
    lock = false,
  ): Promise<User> {
    const staff = await repo.findOne({
      where: { id: staffId, garageId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!staff) throw apiError('NOT_FOUND');
    return staff;
  }

  private audit(
    manager: EntityManager,
    user: IAuthUser,
    action: string,
    staffId: string,
    changes: Record<string, unknown> | null,
  ): Promise<void> {
    return this.auditService.record(
      {
        garageId: user.garageId,
        actorType: ActorType.STAFF,
        actorUserId: user.id,
        action,
        entityType: 'user',
        entityId: staffId,
        changes,
      },
      manager,
    );
  }
}
