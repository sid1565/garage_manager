import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '../constants/error-codes';

const STATUS_BY_CODE = new Map<string, HttpStatus>(Object.entries(ERROR_CODES));

/**
 * Builds the standard error for a catalog code: correct status, `errorCode`, and an
 * i18n message key resolved by HttpExceptionFilter (args interpolated).
 *
 *   throw apiError('INVALID_STATUS_TRANSITION', { from: 'CHECKED_IN', to: 'DELIVERED' });
 */
export const apiError = (code: ErrorCode, args?: Record<string, string>): HttpException =>
  new HttpException(
    { message: `translation.ERROR.${code}`, errorCode: code, ...(args ? { args } : {}) },
    STATUS_BY_CODE.get(code) ?? HttpStatus.INTERNAL_SERVER_ERROR,
  );
