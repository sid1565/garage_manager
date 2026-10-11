import { UserRole } from '../enums';

/** The authenticated principal attached to `request.user` by UserAuthGuard. */
export interface IAuthUser {
  id: string;
  email: string;
  role: UserRole;
  /** null only for PLATFORM_ADMIN. */
  garageId: string | null;
  /** Refresh-token family of this login — logout revokes it. */
  sessionId: string;
}

/**
 * Access-token claims. Deliberately minimal: no email or name (tokens end up in
 * logs and browser memory). Authorisation data is re-read from the DB per request.
 */
export interface IJwtPayload {
  sub: string;
  role: UserRole;
  gid: string | null;
  sid: string;
  iat?: number;
  exp?: number;
}
