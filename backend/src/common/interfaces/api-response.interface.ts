import { Readable } from 'stream';

export interface IApiResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface IPaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface IPaginatedResponse<T> extends IPaginationMeta {
  status: number;
  message: string;
  data: T[];
}

/** What every service method returns; controllers wrap it with ResponseHelper. */
export interface IServiceResult<T> {
  message: string;
  data: T;
}

/** `data` of a list service result; the controller spreads limit/offset/total at top level. */
export interface IPaginatedData<T> {
  items: T[];
  total: number;
}

/** Binary download returned by a service; the controller streams it. */
export interface IFileDownload {
  stream: Readable;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}
