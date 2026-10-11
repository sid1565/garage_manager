import { NotificationChannel } from '../../../common/enums';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * Internal contract used by other services (job cards, estimates, invoices, staff,
 * reminders) to queue messages inside THEIR transaction (pass the EntityManager).
 */
export interface IEnqueueNotificationInput {
  garageId: string;
  type: NotificationType;
  /** Default: the customer's preferredChannels. */
  channels?: NotificationChannel[];
  customerId?: string | null;
  jobCardId?: string | null;
  /** Staff mail (STAFF_WELCOME) — used instead of a customer address. */
  recipientEmail?: string;
  /** Owner link to embed (from CustomerLinkService.create). */
  linkUrl?: string;
  /** Optional personal note from staff, appended to the template. */
  message?: string;
  /** Template variables, e.g. { estimateTotal: '1534.00' }. */
  templateData?: Record<string, string>;
  createdById?: string | null;
}
