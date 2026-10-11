import { HttpStatus } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ERROR_CODES } from '../constants/error-codes';
import { apiError } from './api-error.helper';

describe('apiError / error catalog', () => {
  it('maps a code to its status, errorCode and i18n key', () => {
    const err = apiError('INVALID_STATUS_TRANSITION', { from: 'A', to: 'B' });
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toEqual({
      message: 'translation.ERROR.INVALID_STATUS_TRANSITION',
      errorCode: 'INVALID_STATUS_TRANSITION',
      args: { from: 'A', to: 'B' },
    });
  });

  it('every catalog code has an English message', () => {
    const translation = JSON.parse(
      readFileSync(join(__dirname, '../../i18n/en/translation.json'), 'utf8'),
    ) as { ERROR: Record<string, string> };
    const missing = Object.keys(ERROR_CODES).filter((code) => !(code in translation.ERROR));
    expect(missing).toEqual([]);
  });
});
