import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CUSTOMER_LINK_PURPOSES_KEY } from '../../../common/constants/metadata-keys';
import { LinkPurpose } from '../enums/link-purpose.enum';
import { ICustomerLinkContext } from '../interfaces/customer-link-context.interface';
import { CustomerLinkService } from '../services/customer-link.service';

/**
 * Authenticates vehicle owners (ACT-4) by the `:token` path param. Applied only
 * through @CustomerLinkAccess(...). Staff JWTs are never accepted on portal routes.
 */
@Injectable()
export class CustomerLinkGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly linkService: CustomerLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed =
      this.reflector.getAllAndOverride<LinkPurpose[]>(CUSTOMER_LINK_PURPOSES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context
      .switchToHttp()
      .getRequest<Request<{ token?: string }> & { customerLink?: ICustomerLinkContext }>();
    request.customerLink = await this.linkService.resolve(request.params.token, allowed);
    return true;
  }
}
