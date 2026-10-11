import { CookieOptions, Response } from 'express';
import { REFRESH_COOKIE_NAME } from '../../../common/constants/auth.constants';

export interface IRefreshCookieConfig {
  secure: boolean;
  domain?: string;
  /** e.g. /api/v1/auth — the cookie is never sent to any other route. */
  path: string;
}

const baseOptions = (config: IRefreshCookieConfig): CookieOptions => ({
  httpOnly: true, // not readable by JS → XSS can't exfiltrate it
  secure: config.secure,
  sameSite: 'strict',
  path: config.path,
  domain: config.domain,
});

export const setRefreshCookie = (
  res: Response,
  token: string,
  expires: Date,
  config: IRefreshCookieConfig,
): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...baseOptions(config), expires });
};

export const clearRefreshCookie = (res: Response, config: IRefreshCookieConfig): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(config));
};
