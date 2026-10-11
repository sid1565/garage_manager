import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from '../constants/metadata-keys';

/**
 * Users with a temporary password (must_change_password) are blocked from every
 * route except those marked with this decorator: me, change-password, logout.
 */
export const AllowPasswordChangeRequired = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
