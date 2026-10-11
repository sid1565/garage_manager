export interface IOutgoingMessage {
  recipient: string;
  subject: string | null;
  body: string;
}

export interface IDeliveryResult {
  providerMessageId: string | null;
}

/** One implementation per channel. Throwing = delivery failed (worker retries). */
export interface INotificationProvider {
  send(message: IOutgoingMessage): Promise<IDeliveryResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
