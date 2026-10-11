import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import {
  ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
  IS_PUBLIC_KEY,
} from '../../common/constants/metadata-keys';
import { RecordStatus, UserRole } from '../../common/enums';
import { IAuthUser, IJwtPayload } from '../../common/interfaces/auth-user.interface';

interface IPrincipalRow {
  id: string;
  email: string;
  role: UserRole;
  garage_id: string | null;
  status: RecordStatus;
  must_change_password: boolean;
  password_changed_at: Date | null;
  garage_status: string | null;
  session_active: boolean;
}

/**
 * Global guard #2 (after ThrottlerGuard). For every non-@Public route:
 *  1. verifies the ES256 access token (signature, exp, iss, aud — alg pinned);
 *  2. re-reads the principal in ONE indexed query and rejects if the user is
 *     inactive, the garage is suspended, the session (refresh family) was revoked,
 *     or the password changed after the token was issued.
 * Step 2 makes logout, staff deactivation and garage suspension take effect
 * immediately instead of after the 15-minute access-token lifetime (AC-3.5, AC-19.1).
 */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: IAuthUser }>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException({
        message: 'translation.AUTH_ERROR.UNAUTHENTICATED',
        errorCode: 'UNAUTHENTICATED',
      });
    }

    const payload = await this.verify(token);
    const principal = await this.loadPrincipal(payload);

    const allowWhilePasswordChangeRequired = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
      targets,
    );
    if (principal.must_change_password && !allowWhilePasswordChangeRequired) {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.PASSWORD_CHANGE_REQUIRED',
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    request.user = {
      id: principal.id,
      email: principal.email,
      role: principal.role,
      garageId: principal.garage_id,
      sessionId: payload.sid,
    };
    return true;
  }

  private async verify(token: string): Promise<IJwtPayload> {
    try {
      return await this.jwtService.verifyAsync<IJwtPayload>(token);
    } catch (error) {
      const expired = error instanceof TokenExpiredError;
      throw new UnauthorizedException({
        message: expired
          ? 'translation.AUTH_ERROR.TOKEN_EXPIRED'
          : 'translation.AUTH_ERROR.INVALID_TOKEN',
        errorCode: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }
  }

  private async loadPrincipal(payload: IJwtPayload): Promise<IPrincipalRow> {
    const rows: IPrincipalRow[] = await this.dataSource.query(
      `SELECT u.id, u.email, u.role, u.garage_id, u.status, u.must_change_password,
              u.password_changed_at, g.status AS garage_status,
              EXISTS (
                SELECT 1 FROM refresh_tokens rt
                WHERE rt.family_id = $2 AND rt.user_id = u.id
                  AND rt.revoked_at IS NULL AND rt.expires_at > now()
              ) AS session_active
         FROM users u
         LEFT JOIN garages g ON g.id = u.garage_id
        WHERE u.id = $1`,
      [payload.sub, payload.sid],
    );
    const principal = rows[0];

    const sessionGone =
      !principal ||
      !principal.session_active ||
      (principal.password_changed_at !== null &&
        (payload.iat ?? 0) < Math.floor(principal.password_changed_at.getTime() / 1000));
    if (sessionGone) {
      throw new UnauthorizedException({
        message: 'translation.AUTH_ERROR.SESSION_REVOKED',
        errorCode: 'SESSION_REVOKED',
      });
    }
    if (principal.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.ACCOUNT_INACTIVE',
        errorCode: 'ACCOUNT_INACTIVE',
      });
    }
    if (principal.role !== UserRole.PLATFORM_ADMIN && principal.garage_status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.GARAGE_SUSPENDED',
        errorCode: 'GARAGE_SUSPENDED',
      });
    }
    return principal;
  }

  private extractBearer(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
