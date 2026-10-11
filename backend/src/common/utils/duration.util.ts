const UNIT_SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86400 };

/** "15m" → 900. Accepts the same short form as JWT_ACCESS_EXPIRES_IN. */
export const durationToSeconds = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * (UNIT_SECONDS[match[2]] ?? 0);
};
