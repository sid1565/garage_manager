import { I18nService } from 'nestjs-i18n';
import { toLocale } from '../utils/query.util';

export type EntityKey =
  | 'GARAGE'
  | 'STAFF'
  | 'CUSTOMER'
  | 'VEHICLE'
  | 'JOB_CARD'
  | 'PROBLEM'
  | 'ATTACHMENT'
  | 'ESTIMATE'
  | 'NOTIFICATION'
  | 'INVOICE'
  | 'PAYMENT'
  | 'DASHBOARD'
  | 'AUDIT_LOG'
  | 'LINK';

type Translator = (name: EntityKey, i18n: I18nService, lang?: string) => string;

const withRecord =
  (key: string): Translator =>
  (name, i18n, lang) =>
    i18n.t(`translation.${key}`, {
      lang: toLocale(lang),
      args: { record: i18n.t(`translation.ENTITY.${name}`, { lang: toLocale(lang) }) },
    }) as string;

const plain =
  (key: string) =>
  (i18n: I18nService, lang?: string, args?: Record<string, string>): string =>
    i18n.t(`translation.${key}`, { lang: toLocale(lang), args }) as string;

export const SUCCESS = {
  RECORD_CREATED: withRecord('SUCCESS.RECORD_CREATED'),
  RECORD_UPDATED: withRecord('SUCCESS.RECORD_UPDATED'),
  RECORD_FETCHED: withRecord('SUCCESS.RECORD_FETCHED'),
  RECORD_LIST_FETCHED: withRecord('SUCCESS.RECORD_LIST_FETCHED'),
  RECORD_DELETED: withRecord('SUCCESS.RECORD_DELETED'),
  RECORD_SAVED: withRecord('SUCCESS.RECORD_SAVED'),
  NOTIFICATION_QUEUED: plain('SUCCESS.NOTIFICATION_QUEUED'),
  ESTIMATE_SENT: plain('SUCCESS.ESTIMATE_SENT'),
  ESTIMATE_RESPONDED: plain('SUCCESS.ESTIMATE_RESPONDED'),
  STATUS_CHANGED: plain('SUCCESS.STATUS_CHANGED'),
};

export const ERROR = {
  RECORD_NOT_FOUND: withRecord('ERROR.RECORD_NOT_FOUND'),
  RECORD_ALREADY_EXISTS: withRecord('ERROR.RECORD_ALREADY_EXISTS'),
  FORBIDDEN: plain('ERROR.FORBIDDEN'),
  INVALID_STATUS_TRANSITION: plain('ERROR.INVALID_STATUS_TRANSITION'),
  LINK_EXPIRED: plain('ERROR.LINK_EXPIRED'),
};

export const AUTH_SUCCESS = {
  LOGIN: plain('AUTH_SUCCESS.LOGIN'),
  LOGOUT: plain('AUTH_SUCCESS.LOGOUT'),
  REFRESHED: plain('AUTH_SUCCESS.REFRESHED'),
  REGISTERED: plain('AUTH_SUCCESS.REGISTERED'),
};

export const AUTH_ERROR = {
  UNAUTHENTICATED: plain('AUTH_ERROR.UNAUTHENTICATED'),
  INVALID_CREDENTIALS: plain('AUTH_ERROR.INVALID_CREDENTIALS'),
  INVALID_TOKEN: plain('AUTH_ERROR.INVALID_TOKEN'),
  ACCOUNT_INACTIVE: plain('AUTH_ERROR.ACCOUNT_INACTIVE'),
  GARAGE_SUSPENDED: plain('AUTH_ERROR.GARAGE_SUSPENDED'),
};
