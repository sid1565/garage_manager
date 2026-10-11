import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

/** ParseUUIDPipe with a translatable error key (resolved by HttpExceptionFilter). */
@Injectable()
export class UUIDValidationPipe extends ParseUUIDPipe {
  constructor() {
    super({
      version: '4',
      exceptionFactory: () => new BadRequestException('translation.ERROR.INVALID_UUID'),
    });
  }
}
