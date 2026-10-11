import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class EnumValidationPipe<T extends Record<string, string>> implements PipeTransform<
  string,
  T[keyof T]
> {
  constructor(private readonly enumType: T) {}

  transform(value: string): T[keyof T] {
    const allowed = Object.values(this.enumType);
    if (!allowed.includes(value)) {
      throw new BadRequestException('translation.ERROR.INVALID_ENUM_VALUE');
    }
    return value as T[keyof T];
  }
}
