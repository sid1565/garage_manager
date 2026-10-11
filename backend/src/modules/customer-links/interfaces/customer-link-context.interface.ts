import { LinkPurpose } from '../enums/link-purpose.enum';

/**
 * Principal for public portal routes, attached as `request.customerLink`.
 * Ownership rule `link-scoped`: a portal handler may only read/write the
 * job card (and estimate) named here — never an id from the URL or body.
 */
export interface ICustomerLinkContext {
  linkId: string;
  garageId: string;
  jobCardId: string;
  estimateId: string | null;
  purpose: LinkPurpose;
}
