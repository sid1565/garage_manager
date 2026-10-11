import { formatMinor, lineTotalMinor, parseMinor, percentOfMinor } from './money.util';

describe('money util (BigInt minor units)', () => {
  it('parses and formats exactly', () => {
    expect(parseMinor('1534.5')).toBe(153450n);
    expect(parseMinor('0')).toBe(0n);
    expect(formatMinor(153450n)).toBe('1534.50');
    expect(formatMinor(5n)).toBe('0.05');
    expect(formatMinor(-5n)).toBe('-0.05');
  });

  it('AC-11.1: 2×500 + 1×300 at 18% = 1300 + 234 = 1534.00', () => {
    const subtotal = lineTotalMinor('2', '500.00') + lineTotalMinor('1', '300.00');
    const tax = percentOfMinor(subtotal, '18.00');
    expect(formatMinor(subtotal)).toBe('1300.00');
    expect(formatMinor(tax)).toBe('234.00');
    expect(formatMinor(subtotal + tax)).toBe('1534.00');
  });

  it('rounds half-up and stays exact at the top of NUMERIC(12,2)', () => {
    expect(formatMinor(lineTotalMinor('1.5', '0.33'))).toBe('0.50'); // 0.495 → 0.50
    expect(formatMinor(percentOfMinor(parseMinor('9999999999.99'), '18.00'))).toBe('1800000000.00');
    expect(formatMinor(lineTotalMinor('99999999.99', '99.99'))).toBe('9998999999.00');
  });
});
