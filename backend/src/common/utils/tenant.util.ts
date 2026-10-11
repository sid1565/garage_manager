import { ForbiddenException } from '@nestjs/common';
import { IAuthUser } from '../interfaces/auth-user.interface';

/**
 * Ownership rule `tenant:same-garage`. Every garage-scoped query MUST filter by
 * the value this returns — never by a garage id taken from the request body/query.
 */
export const requireGarageId = (user: IAuthUser): string => {
  if (!user.garageId) throw new ForbiddenException('translation.ERROR.FORBIDDEN');
  return user.garageId;
};
