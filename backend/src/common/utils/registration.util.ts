/** "mh 12 ab-1234" → "MH12AB1234" (UC-5). */
export const normalizeRegistrationNumber = (value: string): string =>
  value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
