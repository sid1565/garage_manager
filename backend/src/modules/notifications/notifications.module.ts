import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CustomerLinksModule } from '../customer-links/customer-links.module';
import { Customer } from '../customers/entities/customer.entity';
import { Garage } from '../garages/entities/garage.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { Problem } from '../job-cards/entities/problem.entity';
import { User } from '../staff/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { NotificationsController } from './controllers/notifications.controller';
import { Notification } from './entities/notification.entity';
import { EmailProvider } from './providers/email.provider';
import { EMAIL_PROVIDER, SMS_PROVIDER } from './providers/notification-provider.interface';
import { SmsProvider } from './providers/sms.provider';
import { NotificationsWorker } from './services/notifications-worker.service';
import { NotificationsService } from './services/notifications.service';
import { ServiceReminderService } from './services/service-reminder.service';

/** Leaf-ish: depends only on audit + customer links, so feature modules can import it. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Garage, Customer, JobCard, Problem, Vehicle, User]),
    AuditModule,
    CustomerLinksModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsWorker,
    ServiceReminderService,
    { provide: EMAIL_PROVIDER, useClass: EmailProvider },
    { provide: SMS_PROVIDER, useClass: SmsProvider },
  ],
  exports: [NotificationsService, NotificationsWorker, ServiceReminderService],
})
export class NotificationsModule {}
