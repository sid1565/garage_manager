import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../../core/config/configuration';
import {
  IDeliveryResult,
  INotificationProvider,
  IOutgoingMessage,
} from './notification-provider.interface';

const TWILIO_TIMEOUT_MS = 10_000;

/** SMS_PROVIDER=twilio → Twilio REST API (no SDK); `console` → logs only (dev/test). */
@Injectable()
export class SmsProvider implements INotificationProvider {
  private readonly logger = new Logger(SmsProvider.name);
  private readonly sms: IAppConfig['sms'];

  constructor(config: ConfigService) {
    this.sms = config.getOrThrow<IAppConfig['sms']>('sms');
  }

  async send(message: IOutgoingMessage): Promise<IDeliveryResult> {
    if (this.sms.provider !== 'twilio') {
      this.logger.log(`[sms:console] to=${message.recipient} chars=${message.body.length}`);
      return { providerMessageId: null };
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sms.twilioSid)}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.sms.twilioSid}:${this.sms.twilioToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: message.recipient,
        From: this.sms.twilioFrom,
        Body: message.body,
      }),
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok)
      throw new Error(`Twilio ${response.status}: ${payload.message ?? 'unknown error'}`);
    return { providerMessageId: payload.sid ?? null };
  }
}
