import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, ValidateBy, ValidationOptions } from 'class-validator';

const DIGITS = /^\d+$/;

/**
 * "123.45" → true when the integer part has ≤ intDigits and the fraction ≤ 2 digits.
 * A tiny parser instead of a nested-quantifier regex (keeps eslint-plugin-security clean).
 */
export const isDecimalString = (value: unknown, intDigits: number): boolean => {
  if (typeof value !== 'string') return false;
  const [int, frac, ...rest] = value.split('.');
  if (rest.length > 0 || !DIGITS.test(int) || int.length > intDigits) return false;
  return frac === undefined || (DIGITS.test(frac) && frac.length >= 1 && frac.length <= 2);
};

const decimal = (
  name: string,
  intDigits: number,
  extra: (n: number) => boolean,
  message: string,
): PropertyDecorator =>
  ValidateBy(
    {
      name,
      validator: {
        validate: (value: unknown): boolean =>
          isDecimalString(value, intDigits) && extra(Number(value)),
        defaultMessage: (): string => message,
      },
    },
    {} as ValidationOptions,
  );

/**
 * NUMERIC(12,2) money as a string: "1534.00", "99.5", "0" (NFR-6). Never a JS number.
 * `positive: true` rejects zero (payments).
 */
export const IsMoney = (options: { positive?: boolean } = {}): PropertyDecorator =>
  applyDecorators(
    IsString(),
    decimal(
      options.positive ? 'isPositiveMoney' : 'isMoney',
      10,
      (n) => !options.positive || n > 0,
      options.positive
        ? '$property must be a positive decimal string like "500.00"'
        : '$property must be a decimal string like "1534.00"',
    ),
  );

/** NUMERIC(10,2) quantity (hours or units), strictly positive. */
export const IsQuantity = (): PropertyDecorator =>
  applyDecorators(
    IsString(),
    decimal(
      'isQuantity',
      8,
      (n) => n > 0,
      '$property must be a positive decimal string like "1.5"',
    ),
  );

/** NUMERIC(5,2) percentage 0–100, e.g. "18.00". */
export const IsPercentage = (): PropertyDecorator =>
  applyDecorators(
    IsString(),
    decimal(
      'isPercentage',
      3,
      (n) => n <= 100,
      '$property must be a percentage 0–100 like "18.00"',
    ),
  );

/** E.164 phone, e.g. +919876543210. */
export const IsE164Phone = (): PropertyDecorator =>
  applyDecorators(
    IsString(),
    Matches(/^\+[1-9]\d{7,14}$/, {
      message: '$property must be in E.164 format, e.g. +919876543210',
    }),
  );
