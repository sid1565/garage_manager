import { HttpStatus } from '@nestjs/common';
import {
  IApiResponse,
  IPaginatedResponse,
  IPaginationMeta,
} from '../interfaces/api-response.interface';

export class ResponseHelper {
  static success<T>(message: string, data: T, status: number = HttpStatus.OK): IApiResponse<T> {
    return { status, message, data };
  }

  static paginatedSuccess<T, E extends object = object>(
    message: string,
    paginationMeta: IPaginationMeta,
    data: T[],
    extra?: E,
  ): IPaginatedResponse<T> & E {
    return {
      status: HttpStatus.OK,
      message,
      ...paginationMeta,
      ...(extra ?? ({} as E)),
      data,
    };
  }

  static paginatedSuccessWithSummary<T, S>(
    message: string,
    list: T[],
    paginationMeta: IPaginationMeta,
    summary: S,
  ): IApiResponse<{ list: T[]; summary: S }> & IPaginationMeta {
    return { status: HttpStatus.OK, message, ...paginationMeta, data: { list, summary } };
  }

  static error(
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
  ): { status: number; message: string } {
    return { status, message };
  }
}
