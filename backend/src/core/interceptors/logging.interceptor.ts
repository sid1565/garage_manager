import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Logs method, path, status and latency; propagates an x-correlation-id header. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response.statusCode, started, correlationId),
        error: () => this.log(request, response.statusCode, started, correlationId),
      }),
    );
  }

  private log(request: Request, status: number, started: number, correlationId: string): void {
    this.logger.log(
      `${request.method} ${request.originalUrl} ${status} ${Date.now() - started}ms [${correlationId}]`,
    );
  }
}
