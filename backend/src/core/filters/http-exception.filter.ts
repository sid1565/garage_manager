import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService } from 'nestjs-i18n';

const DEFAULT_ERROR_CODES = new Map<number, string>([
  [400, 'VALIDATION_FAILED'],
  [401, 'UNAUTHENTICATED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
  [409, 'CONFLICT'],
  [410, 'GONE'],
  [429, 'TOO_MANY_REQUESTS'],
  [500, 'INTERNAL_ERROR'],
]);

interface IErrorDetail {
  field: string;
  issue: string;
}

interface IExceptionBody {
  message?: string | string[];
  args?: Record<string, string>;
  errorCode?: string;
  details?: IErrorDetail[];
}

/** Produces the standard error envelope with i18n-resolved messages. */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const lang = request.headers['accept-language']?.split(',')[0]?.split(';')[0];

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'translation.ERROR.INTERNAL_ERROR';
    let errorCode = DEFAULT_ERROR_CODES.get(status) ?? 'ERROR';
    let details: IErrorDetail[] | undefined;
    let args: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const typed = body as IExceptionBody;
        errorCode = typed.errorCode ?? errorCode;
        args = typed.args;
        details = typed.details;
        if (Array.isArray(typed.message)) {
          // class-validator output from the global ValidationPipe
          message = 'translation.ERROR.VALIDATION_FAILED';
          details = typed.message.map((m) => ({ field: m.split(' ')[0], issue: m }));
        } else if (typed.message) {
          message = typed.message;
        }
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    if (message.startsWith('translation.')) {
      message = this.i18n.t(message, { lang, args }) as string;
    }

    response.status(status).json({
      statusCode: status,
      errorCode,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
