import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Readable } from 'stream';
import { apiError } from '../../../common/helpers/api-error.helper';

export interface IStoredObject {
  /** Random, non-guessable key, e.g. `<garageId>/<uuid>.jpg`; never derived from the upload name. */
  key: string;
  sizeBytes: number;
}

const EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

/**
 * NFR-8 file storage, local-disk driver (STORAGE_LOCAL_DIR). Keys are generated here and
 * every path is resolved under the root and re-checked, so a tampered key can never escape
 * it (path traversal). S3 is a tracked follow-up behind the same interface.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('storage.localDir', './uploads'));
  }

  async put(garageId: string, body: Buffer, mimeType: string): Promise<IStoredObject> {
    const key = `${garageId}/${randomUUID()}${EXTENSIONS.get(mimeType) ?? ''}`;
    const path = this.pathFor(key);
    // Path built from a generated key and verified to sit under the storage root.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await mkdir(dirname(path), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(path, body, { flag: 'wx' });
    return { key, sizeBytes: body.length };
  }

  async openRead(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await stat(path);
    } catch {
      this.logger.error(`Stored object missing: ${key}`);
      throw apiError('NOT_FOUND');
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return createReadStream(path);
  }

  /** Idempotent: a missing file is not an error. */
  async remove(key: string): Promise<void> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      this.logger.warn(`Rejected storage key outside root: ${key}`);
      throw apiError('NOT_FOUND');
    }
    return path;
  }
}
