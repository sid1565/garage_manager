import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CustomerLinksModule } from '../customer-links/customer-links.module';
import { EstimateLineItem } from '../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../estimates/entities/estimate.entity';
import { Garage } from '../garages/entities/garage.entity';
import { GaragesModule } from '../garages/garages.module';
import { Invoice } from '../invoices/entities/invoice.entity';
import { User } from '../staff/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AttachmentsController } from './controllers/attachments.controller';
import { JobCardsController } from './controllers/job-cards.controller';
import { ProblemsController } from './controllers/problems.controller';
import { Attachment } from './entities/attachment.entity';
import { JobCard } from './entities/job-card.entity';
import { JobStatusHistory } from './entities/job-status-history.entity';
import { Problem } from './entities/problem.entity';
import { AttachmentsService } from './services/attachments.service';
import { JobCardsService } from './services/job-cards.service';
import { ProblemsService } from './services/problems.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobCard,
      JobStatusHistory,
      Problem,
      Attachment,
      Vehicle,
      User,
      Garage,
      Estimate,
      EstimateLineItem,
      Invoice,
    ]),
    GaragesModule,
    CustomerLinksModule,
    AuditModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [JobCardsController, ProblemsController, AttachmentsController],
  providers: [JobCardsService, ProblemsService, AttachmentsService],
  exports: [JobCardsService],
})
export class JobCardsModule {}
