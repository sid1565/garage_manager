/** NFR-8 upload limits (the DB also enforces 0 < size ≤ 5 MB via CHK_attachments_size). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_PROBLEM = 10;
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
