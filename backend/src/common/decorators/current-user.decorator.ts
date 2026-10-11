import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IAuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IAuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: IAuthUser }>();
    return request.user;
  },
);
