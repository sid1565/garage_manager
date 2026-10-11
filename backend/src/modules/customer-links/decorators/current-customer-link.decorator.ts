import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ICustomerLinkContext } from '../interfaces/customer-link-context.interface';

export const CurrentCustomerLink = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ICustomerLinkContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { customerLink: ICustomerLinkContext }>();
    return request.customerLink;
  },
);
