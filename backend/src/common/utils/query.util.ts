import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/** Escapes LIKE wildcards so user input is matched literally: "50%_off" → "50\%\_off". */
export const likeTerm = (search: string): string =>
  `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Applies a validated `order` object (keys already whitelisted by @AllowedOrderKeys)
 * through an explicit key → column map, so only mapped columns reach SQL.
 */
export const applyOrder = <T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  order: Record<string, 'ASC' | 'DESC'>,
  columns: ReadonlyMap<string, string>,
  fallback: [string, 'ASC' | 'DESC'],
): SelectQueryBuilder<T> => {
  let applied = false;
  for (const [key, direction] of Object.entries(order)) {
    const column = columns.get(key);
    if (!column) continue;
    if (applied) qb.addOrderBy(column, direction);
    else qb.orderBy(column, direction);
    applied = true;
  }
  if (!applied) qb.orderBy(fallback[0], fallback[1]);
  return qb;
};

/** Normalises an Accept-Language header to a supported locale ("en-US,en;q=0.9" → "en"). */
export const toLocale = (lang?: string): string => {
  const primary = lang?.split(',')[0]?.split(';')[0]?.split('-')[0]?.trim().toLowerCase();
  return primary && /^[a-z]{2}$/.test(primary) ? primary : 'en';
};
