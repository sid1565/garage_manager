/** Real file type from magic bytes — the client-declared mimetype/name are never trusted. */
const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

export const detectMimeType = (buf: Buffer): string | null => {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
};

/** Display-only name: no path parts, no control characters, ≤ 255 chars. */
export const safeFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = Array.from(base)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim();
  return (cleaned || 'file').slice(0, 255);
};
