import { HttpStatus } from '@nestjs/common';

/**
 * Domain error catalog (stage 4 contract). Each code has a fixed HTTP status and an
 * i18n message at `translation.ERROR.<CODE>`. Throw with `apiError('CODE')`
 * (common/helpers/api-error.helper.ts) — never invent ad-hoc codes in services;
 * add them here + in i18n/en/translation.json.
 */
export const ERROR_CODES = {
  // 400 — business-rule validation
  AMOUNT_EXCEEDS_BALANCE: HttpStatus.BAD_REQUEST,
  CANNOT_DEACTIVATE_SELF: HttpStatus.BAD_REQUEST,
  DECISIONS_INCOMPLETE: HttpStatus.BAD_REQUEST,
  DISCOUNT_TOO_LARGE: HttpStatus.BAD_REQUEST,
  EMAIL_REQUIRED_FOR_CHANNEL: HttpStatus.BAD_REQUEST,
  INVALID_MECHANIC: HttpStatus.BAD_REQUEST,
  INVALID_PROBLEM_REFERENCE: HttpStatus.BAD_REQUEST,
  LAST_GARAGE_ADMIN: HttpStatus.BAD_REQUEST,
  NO_CONTACT_FOR_CHANNEL: HttpStatus.BAD_REQUEST,
  NO_LINE_ITEMS: HttpStatus.BAD_REQUEST,
  NO_PROBLEMS_RECORDED: HttpStatus.BAD_REQUEST,
  NOTHING_TO_INVOICE: HttpStatus.BAD_REQUEST,
  ODOMETER_DECREASED: HttpStatus.BAD_REQUEST,
  PAYMENT_IN_FUTURE: HttpStatus.BAD_REQUEST,
  TOO_MANY_ATTACHMENTS: HttpStatus.BAD_REQUEST,
  UNKNOWN_LINE_ITEM: HttpStatus.BAD_REQUEST,
  UNSUPPORTED_FILE_TYPE: HttpStatus.BAD_REQUEST,
  // 403 — row-level ownership (section checks use FORBIDDEN_SECTION in SectionGuard)
  NOT_ASSIGNED_MECHANIC: HttpStatus.FORBIDDEN,
  MECHANIC_TRANSITION_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  // 404 — also used for other-garage resources (tenant:same-garage)
  NOT_FOUND: HttpStatus.NOT_FOUND,
  // 409 — state conflicts
  EMAIL_ALREADY_REGISTERED: HttpStatus.CONFLICT,
  ESTIMATE_ALREADY_RESPONDED: HttpStatus.CONFLICT,
  ESTIMATE_NOT_APPROVED: HttpStatus.CONFLICT,
  ESTIMATE_NOT_DRAFT: HttpStatus.CONFLICT,
  HAS_OPEN_JOB: HttpStatus.CONFLICT,
  INVALID_STATUS_TRANSITION: HttpStatus.CONFLICT,
  INVOICE_EXISTS: HttpStatus.CONFLICT,
  INVOICE_NOT_PAID: HttpStatus.CONFLICT,
  INVOICE_REQUIRED: HttpStatus.CONFLICT,
  VEHICLE_INACTIVE: HttpStatus.CONFLICT,
  INVOICE_VOID: HttpStatus.CONFLICT,
  JOB_CLOSED: HttpStatus.CONFLICT,
  JOB_NOT_EDITABLE: HttpStatus.CONFLICT,
  JOB_NOT_ESTIMABLE: HttpStatus.CONFLICT,
  JOB_NOT_READY: HttpStatus.CONFLICT,
  NOT_FAILED: HttpStatus.CONFLICT,
  OPEN_JOB_EXISTS: HttpStatus.CONFLICT,
  PHONE_ALREADY_EXISTS: HttpStatus.CONFLICT,
  PROBLEM_LOCKED: HttpStatus.CONFLICT,
  REGISTRATION_EXISTS: HttpStatus.CONFLICT,
  // 410
  ESTIMATE_EXPIRED: HttpStatus.GONE,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
