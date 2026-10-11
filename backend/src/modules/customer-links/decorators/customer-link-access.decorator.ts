import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PORTAL_THROTTLE } from '../../../common/constants/auth.constants';
import { CUSTOMER_LINK_PURPOSES_KEY } from '../../../common/constants/metadata-keys';
import { Public } from '../../../common/decorators/public.decorator';
import { LinkPurpose } from '../enums/link-purpose.enum';
import { CustomerLinkGuard } from '../guards/customer-link.guard';

/**
 * The ONLY way to expose a public portal route. Route path must contain `:token`.
 * Bundles: skip staff auth, the link guard, the purposes allowed, and the
 * stricter portal rate limit (30/min per IP, NFR-5).
 *
 *   @CustomerLinkAccess(LinkPurpose.VIEW_JOB, LinkPurpose.APPROVE_ESTIMATE)  // view
 *   @CustomerLinkAccess(LinkPurpose.APPROVE_ESTIMATE)                        // approve
 */
export const CustomerLinkAccess = (...purposes: LinkPurpose[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    Public(),
    SetMetadata(CUSTOMER_LINK_PURPOSES_KEY, purposes),
    UseGuards(CustomerLinkGuard),
    Throttle(PORTAL_THROTTLE),
    ApiParam({ name: 'token', description: 'Customer link token from the SMS/email' }),
  );
