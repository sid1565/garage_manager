import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { map, Observable } from 'rxjs';

/**
 * Translates the `message` field of every response when it is a translation key
 * (prefixed with 'translation.'). Already-localized strings pass through untouched.
 * It does NOT wrap responses — controllers call ResponseHelper explicitly.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly i18n: I18nService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const lang = request.headers['accept-language']?.split(',')[0]?.split(';')[0];

    return next.handle().pipe(
      map((body: unknown) => {
        if (body && typeof body === 'object' && 'message' in body) {
          const message = (body as { message: unknown }).message;
          if (typeof message === 'string' && message.startsWith('translation.')) {
            return { ...body, message: this.i18n.t(message, { lang }) as string };
          }
        }
        return body;
      }),
    );
  }
}
