import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY, SECTION_KEY } from '../../common/constants/metadata-keys';
import { SECTION_PERMISSIONS, SectionKey } from '../../common/constants/section-permissions';
import { IAuthUser } from '../../common/interfaces/auth-user.interface';

/**
 * Global guard #3 (after UserAuthGuard). Checks the handler's @Section(...) against
 * SECTION_PERMISSIONS for the user's role (default-deny: unknown role → no sections).
 * Routes without @Section only require authentication — use that ONLY for
 * self-service routes (me, change-password, logout). Row-level ownership rules
 * (tenant:same-garage, assigned-mechanic) are enforced in services.
 */
@Injectable()
export class SectionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const section = this.reflector.getAllAndOverride<SectionKey | undefined>(SECTION_KEY, targets);
    if (!section) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: IAuthUser }>().user;
    const allowed = user ? SECTION_PERMISSIONS[user.role]?.has(section) : false;
    if (!allowed) {
      throw new ForbiddenException({
        message: 'translation.ERROR.FORBIDDEN',
        errorCode: 'FORBIDDEN_SECTION',
      });
    }
    return true;
  }
}
