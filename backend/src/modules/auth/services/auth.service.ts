import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AUDIT_ACTIONS } from '../../../common/constants/audit-actions';
import { RecordStatus, UserRole } from '../../../common/enums';
import { isUniqueViolation } from '../../../common/utils/db-error.util';
import { IAuthUser } from '../../../common/interfaces/auth-user.interface';
import { IServiceResult } from '../../../common/interfaces/api-response.interface';
import { ActorType } from '../../audit/enums/actor-type.enum';
import { AuditService } from '../../audit/services/audit.service';
import { Garage } from '../../garages/entities/garage.entity';
import { GarageStatus } from '../../garages/enums/garage-status.enum';
import { User } from '../../staff/entities/user.entity';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterGarageDto } from '../dto/register-garage.dto';
import { IIssuedTokens, IRequestMeta } from '../interfaces/request-meta.interface';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface IAuthUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  garageId: string | null;
  garageName: string | null;
  mustChangePassword: boolean;
}

export interface IAuthSession {
  tokens: IIssuedTokens;
  user: IAuthUserSummary;
}

const invalidCredentials = (): UnauthorizedException =>
  new UnauthorizedException({
    message: 'translation.AUTH_ERROR.INVALID_CREDENTIALS',
    errorCode: 'INVALID_CREDENTIALS',
  });

const sessionRevoked = (): UnauthorizedException =>
  new UnauthorizedException({
    message: 'translation.AUTH_ERROR.SESSION_REVOKED',
    errorCode: 'SESSION_REVOKED',
  });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxAttempts: number;
  private readonly lockMinutes: number;

  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
  ) {
    this.maxAttempts = config.get<number>('security.loginMaxAttempts', 5);
    this.lockMinutes = config.get<number>('security.loginLockMinutes', 15);
  }

  /** UC-1 — garage + GARAGE_ADMIN in one transaction, then a first session. */
  async register(
    dto: RegisterGarageDto,
    meta: IRequestMeta,
  ): Promise<IServiceResult<IAuthSession>> {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.exist({ where: { email } })) throw this.emailTaken();
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const session = await this.dataSource.transaction(async (manager) => {
        const garage = await manager.getRepository(Garage).save(
          manager.getRepository(Garage).create({
            name: dto.garageName.trim(),
            phone: dto.garagePhone,
            city: dto.city ?? null,
            email: email,
          }),
        );
        const user = await manager.getRepository(User).save(
          manager.getRepository(User).create({
            garageId: garage.id,
            name: dto.name.trim(),
            email,
            phone: dto.phone ?? null,
            passwordHash,
            role: UserRole.GARAGE_ADMIN,
            lastLoginAt: new Date(),
          }),
        );
        await this.auditService.record(
          {
            garageId: garage.id,
            actorType: ActorType.STAFF,
            actorUserId: user.id,
            action: AUDIT_ACTIONS.GARAGE_REGISTERED,
            entityType: 'garage',
            entityId: garage.id,
            ipAddress: meta.ip,
          },
          manager,
        );
        const tokens = await this.tokenService.issueForNewSession(user, meta, manager);
        return { tokens, user: this.summarise(user, garage) };
      });
      return { message: 'translation.AUTH_SUCCESS.REGISTERED', data: session };
    } catch (error) {
      if (isUniqueViolation(error)) throw this.emailTaken(); // lost a race with a concurrent signup
      throw error;
    }
  }

  /**
   * UC-2 login. The same 401 is returned for unknown email, wrong password and a
   * locked account (no user enumeration, AC-2.2). Status checks run only after the
   * password is verified, so they can't be used to probe which emails exist.
   */
  async login(dto: LoginDto, meta: IRequestMeta): Promise<IServiceResult<IAuthSession>> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.garage', 'g')
      .where('u.email = :email', { email: dto.email.trim() })
      .getOne();

    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    // Always run bcrypt (dummy hash when unknown/locked) so timing is uniform.
    const passwordOk = await this.passwordService.verify(
      dto.password,
      user && !locked ? user.passwordHash : null,
    );

    if (!user || locked || !passwordOk) {
      if (user && !locked) await this.registerFailedAttempt(user, meta);
      throw invalidCredentials();
    }
    this.assertCanSignIn(user);

    const session = await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update(
          { id: user.id },
          { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        );
      await this.auditService.record(
        {
          garageId: user.garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
          entityType: 'user',
          entityId: user.id,
          ipAddress: meta.ip,
        },
        manager,
      );
      const tokens = await this.tokenService.issueForNewSession(user, meta, manager);
      return { tokens, user: this.summarise(user, user.garage) };
    });
    return { message: 'translation.AUTH_SUCCESS.LOGIN', data: session };
  }

  /**
   * Rotation with reuse detection (AC-2.4, AC-2.5). The token row is locked, so two
   * concurrent refreshes cannot both succeed. Presenting an already-rotated token
   * revokes the whole session family — the legitimate user and the thief are both out.
   */
  async refresh(rawToken: string, meta: IRequestMeta): Promise<IServiceResult<IAuthSession>> {
    type Outcome = { kind: 'ok'; session: IAuthSession } | { kind: 'invalid' } | { kind: 'reuse' };

    const outcome = await this.dataSource.transaction(async (manager): Promise<Outcome> => {
      const token = await this.tokenService.findByRawForUpdate(rawToken, manager);
      if (!token) return { kind: 'invalid' };

      if (token.revokedAt) {
        if (!token.replacedById) return { kind: 'invalid' }; // logged out
        await this.tokenService.revokeFamily(token.familyId, manager);
        await this.auditService.record(
          {
            garageId: null,
            actorType: ActorType.SYSTEM,
            actorUserId: token.userId,
            action: AUDIT_ACTIONS.REFRESH_REUSE_DETECTED,
            entityType: 'session',
            entityId: token.familyId,
            ipAddress: meta.ip,
          },
          manager,
        );
        return { kind: 'reuse' };
      }
      if (token.expiresAt <= new Date()) return { kind: 'invalid' };

      const user = await manager
        .getRepository(User)
        .findOne({ where: { id: token.userId }, relations: { garage: true } });
      if (!user || !this.canSignIn(user)) {
        await this.tokenService.revokeFamily(token.familyId, manager);
        return { kind: 'invalid' };
      }
      const tokens = await this.tokenService.issueRotated(user, token, meta, manager);
      return { kind: 'ok', session: { tokens, user: this.summarise(user, user.garage) } };
    });

    if (outcome.kind === 'reuse') {
      this.logger.warn(`Refresh token reuse detected from ${meta.ip ?? 'unknown ip'}`);
      throw sessionRevoked();
    }
    if (outcome.kind === 'invalid') throw sessionRevoked();
    return { message: 'translation.AUTH_SUCCESS.REFRESHED', data: outcome.session };
  }

  /** Ends the current session only (the refresh family named by the token's `sid`). */
  async logout(user: IAuthUser): Promise<IServiceResult<null>> {
    await this.tokenService.revokeFamily(user.sessionId);
    return { message: 'translation.AUTH_SUCCESS.LOGOUT', data: null };
  }

  async logoutAll(user: IAuthUser, meta: IRequestMeta): Promise<IServiceResult<null>> {
    await this.dataSource.transaction(async (manager) => {
      await this.tokenService.revokeAllForUser(user.id, manager);
      await this.auditService.record(
        {
          garageId: user.garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.LOGGED_OUT_ALL,
          entityType: 'user',
          entityId: user.id,
          ipAddress: meta.ip,
        },
        manager,
      );
    });
    return { message: 'translation.AUTH_SUCCESS.LOGGED_OUT_ALL', data: null };
  }

  async me(authUser: IAuthUser): Promise<IServiceResult<IAuthUserSummary>> {
    const user = await this.userRepo.findOne({
      where: { id: authUser.id },
      relations: { garage: true },
    });
    if (!user) throw new NotFoundException('translation.ERROR.RECORD_NOT_FOUND');
    return {
      message: 'translation.AUTH_SUCCESS.PROFILE_FETCHED',
      data: this.summarise(user, user.garage),
    };
  }

  /**
   * Revokes every session (including other devices) and starts a fresh one for the
   * caller, so the current client stays signed in with new tokens.
   */
  async changePassword(
    authUser: IAuthUser,
    dto: ChangePasswordDto,
    meta: IRequestMeta,
  ): Promise<IServiceResult<IAuthSession>> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.garage', 'g')
      .where('u.id = :id', { id: authUser.id })
      .getOne();
    if (!user) throw sessionRevoked();

    if (!(await this.passwordService.verify(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException({
        message: 'translation.AUTH_ERROR.CURRENT_PASSWORD_INCORRECT',
        errorCode: 'CURRENT_PASSWORD_INCORRECT',
      });
    }
    if (await this.passwordService.verify(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException({
        message: 'translation.AUTH_ERROR.PASSWORD_REUSED',
        errorCode: 'PASSWORD_REUSED',
      });
    }
    const passwordHash = await this.passwordService.hash(dto.newPassword);

    const session = await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(
        { id: user.id },
        {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      );
      await this.tokenService.revokeAllForUser(user.id, manager);
      await this.auditService.record(
        {
          garageId: user.garageId,
          actorType: ActorType.STAFF,
          actorUserId: user.id,
          action: AUDIT_ACTIONS.PASSWORD_CHANGED,
          entityType: 'user',
          entityId: user.id,
          ipAddress: meta.ip,
        },
        manager,
      );
      const tokens = await this.tokenService.issueForNewSession(user, meta, manager);
      return {
        tokens,
        user: { ...this.summarise(user, user.garage), mustChangePassword: false },
      };
    });
    return { message: 'translation.AUTH_SUCCESS.PASSWORD_CHANGED', data: session };
  }

  /** Atomic increment; locks the account for LOGIN_LOCK_MINUTES after LOGIN_MAX_ATTEMPTS. */
  private async registerFailedAttempt(user: User, meta: IRequestMeta): Promise<void> {
    // Atomic in SQL so concurrent wrong guesses can't race past the limit.
    const result = await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ failedLoginAttempts: () => 'failed_login_attempts + 1' })
      .where('id = :id', { id: user.id })
      .returning('failed_login_attempts')
      .execute();
    const rows = result.raw as { failed_login_attempts: number }[];
    const attempts = rows[0]?.failed_login_attempts ?? 0;
    const lockNow = attempts >= this.maxAttempts;
    if (lockNow) {
      await this.userRepo.update(
        { id: user.id },
        {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + this.lockMinutes * 60_000),
        },
      );
    }
    await this.auditService.record({
      garageId: user.garageId,
      actorType: ActorType.STAFF,
      actorUserId: user.id,
      action: lockNow ? AUDIT_ACTIONS.ACCOUNT_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      changes: { attempts },
      ipAddress: meta.ip,
    });
  }

  private canSignIn(user: User): boolean {
    if (user.status !== RecordStatus.ACTIVE) return false;
    return user.role === UserRole.PLATFORM_ADMIN || user.garage?.status === GarageStatus.ACTIVE;
  }

  private assertCanSignIn(user: User): void {
    if (user.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.ACCOUNT_INACTIVE',
        errorCode: 'ACCOUNT_INACTIVE',
      });
    }
    if (user.role !== UserRole.PLATFORM_ADMIN && user.garage?.status !== GarageStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.GARAGE_SUSPENDED',
        errorCode: 'GARAGE_SUSPENDED',
      });
    }
  }

  private summarise(user: User, garage: Garage | null): IAuthUserSummary {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      garageId: user.garageId,
      garageName: garage?.name ?? null,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      message: 'translation.ERROR.EMAIL_ALREADY_REGISTERED',
      errorCode: 'EMAIL_ALREADY_REGISTERED',
    });
  }
}
