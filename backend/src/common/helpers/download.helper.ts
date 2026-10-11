import { StreamableFile } from '@nestjs/common';
import { IFileDownload } from '../interfaces/api-response.interface';

/**
 * Streams a stored file. Always `attachment` (never inline) so an uploaded file can't
 * execute in the API origin (auth design R-9); RFC 5987 encoding for the name.
 */
export const toStreamableFile = (file: IFileDownload): StreamableFile =>
  new StreamableFile(file.stream, {
    type: file.mimeType,
    length: file.sizeBytes,
    disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  });
