import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { IAppConfig } from '../../../core/config/configuration';
import {
  IDeliveryResult,
  INotificationProvider,
  IOutgoingMessage,
} from './notification-provider.interface';

/** MAIL_DRIVER=smtp → nodemailer SMTP; MAIL_DRIVER=log → logs only (dev/test). */
@Injectable()
export class EmailProvider implements INotificationProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private readonly mail: IAppConfig['mail'];
  private transporter?: Transporter;

  constructor(config: ConfigService) {
    this.mail = config.getOrThrow<IAppConfig['mail']>('mail');
  }

  async send(message: IOutgoingMessage): Promise<IDeliveryResult> {
    if (this.mail.driver !== 'smtp') {
      this.logger.log(`[email:log] to=${message.recipient} subject="${message.subject ?? ''}"`);
      return { providerMessageId: null };
    }
    this.transporter ??= createTransport({
      host: this.mail.host,
      port: this.mail.port,
      secure: this.mail.port === 465,
      auth: this.mail.user ? { user: this.mail.user, pass: this.mail.password } : undefined,
    });
    const info = (await this.transporter.sendMail({
      from: this.mail.from,
      to: message.recipient,
      subject: message.subject ?? '',
      text: message.body,
    })) as { messageId?: string };
    return { providerMessageId: info.messageId ?? null };
  }
}
