import { ValueTransformer } from 'typeorm';

/**
 * NUMERIC columns stay as strings end-to-end (NFR-6). Postgres already returns them
 * with exact scale ("1534.00"), so the transformer is an identity — never parseFloat.
 * Arithmetic uses BigInt minor units (paise/cents): exact for the full NUMERIC(12,2)
 * range, where float maths would lose precision.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: string | null): string | null | undefined => value,
  from: (value?: string | null): string | null | undefined => value,
};

/** Column options for every money column: NUMERIC(12,2) kept as a string. */
export const MONEY_COLUMN = {
  type: 'numeric',
  precision: 12,
  scale: 2,
  transformer: decimalTransformer,
} as const;

/** "1534.5" → 153450n. Input is a validated non-negative decimal string (≤ 2 dp). */
export const parseMinor = (value: string): bigint => {
  const [int, frac = ''] = value.split('.');
  return BigInt(int) * 100n + BigInt(`${frac}00`.slice(0, 2));
};

/** 153450n → "1534.50". */
export const formatMinor = (minor: bigint): string => {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
};

/** Integer division rounding half away from zero. */
const divRound = (n: bigint, d: bigint): bigint =>
  n >= 0n ? (n + d / 2n) / d : -((-n + d / 2n) / d);

/** quantity × unitPrice, both 2-dp strings → minor units ("2" × "500.00" → 100000n). */
export const lineTotalMinor = (quantity: string, unitPrice: string): bigint =>
  divRound(parseMinor(quantity) * parseMinor(unitPrice), 100n);

/** amount × rate% ("18.00") → minor units, rounded half-up (130000n @ 18% → 23400n). */
export const percentOfMinor = (amountMinor: bigint, rate: string): bigint =>
  divRound(amountMinor * parseMinor(rate), 10000n);

export const sumMinor = (values: bigint[]): bigint => values.reduce((a, b) => a + b, 0n);
