/**
 * Turns how people actually type Indian numbers into the E.164 form the API stores:
 * "98765 43210", "09876543210", "919876543210", "+91 98765-43210" → "+919876543210".
 * Anything already in +<country> form is kept; other input is passed through so the
 * API can explain what's wrong.
 */
export const toE164 = (raw: string): string => {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
};
