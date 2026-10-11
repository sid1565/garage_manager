import { Throttle } from '@nestjs/throttler';

type ThrottleOptions = Parameters<typeof Throttle>[0];

/** httpOnly refresh-token cookie (web clients only). */
export const REFRESH_COOKIE_NAME = 'gm_rt';

/**
 * Every auth call declares its client type. Web clients MUST send it on cookie
 * routes: a custom header forces a CORS preflight, so cross-site forms cannot
 * replay the cookie (CSRF defence, together with SameSite=Strict + Origin check).
 */
export const CLIENT_TYPE_HEADER = 'x-client-type';

export enum ClientType {
  WEB = 'web',
  MOBILE = 'mobile',
}

const limitFromEnv = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/** login / register / refresh / change-password — 10 req/min per IP by default. */
export const AUTH_THROTTLE: ThrottleOptions = {
  default: { limit: limitFromEnv(process.env.THROTTLE_AUTH_LIMIT, 10), ttl: 60_000 },
};

/** Public customer-link endpoints — 30 req/min per IP by default (NFR-5). */
export const PORTAL_THROTTLE: ThrottleOptions = {
  default: { limit: limitFromEnv(process.env.THROTTLE_PORTAL_LIMIT, 30), ttl: 60_000 },
};

/** bcrypt only hashes the first 72 bytes — longer passwords are rejected, not truncated. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** Customer link tokens: 32 random bytes = 256 bits of entropy (NFR-5). */
export const LINK_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_BYTES = 32;
