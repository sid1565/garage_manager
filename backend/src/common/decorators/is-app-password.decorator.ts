import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/auth.constants';

/** NFR-4 password policy: 8–72 chars, at least one letter and one digit. */
export const IsAppPassword = (): PropertyDecorator =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH),
    MaxLength(PASSWORD_MAX_LENGTH),
    Matches(/[A-Za-z]/, { message: 'password must contain a letter' }),
    Matches(/\d/, { message: 'password must contain a digit' }),
  );
