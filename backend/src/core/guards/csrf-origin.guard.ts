import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { CLIENT_TYPE_HEADER, ClientType } from '../../common/constants/auth.constants';

/**
 * Applied (via @UseGuards) to routes that read the refresh cookie: refresh and logout.
 * - `x-client-type` is required. `mobile` never reads the cookie, so it needs no CSRF check.
 * - `web` must come from an allow-listed Origin. The custom header already forces a CORS
 *   preflight; the Origin check plus SameSite=Strict are additional layers (OWASP CSRF cheat sheet).
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientType = request.header(CLIENT_TYPE_HEADER);

    if (clientType === ClientType.MOBILE) return true;
    if (clientType !== ClientType.WEB) {
      throw new BadRequestException({
        message: 'translation.AUTH_ERROR.CLIENT_TYPE_REQUIRED',
        errorCode: 'CLIENT_TYPE_REQUIRED',
      });
    }

    const origin = request.headers.origin;
    const allowed = this.config.get<string[]>('corsOrigins', []);
    if (!origin || !allowed.includes(origin)) {
      throw new ForbiddenException({
        message: 'translation.AUTH_ERROR.CSRF_REJECTED',
        errorCode: 'CSRF_REJECTED',
      });
    }
    return true;
  }
}
