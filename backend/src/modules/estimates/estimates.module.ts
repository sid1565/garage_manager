import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CustomerLinksModule } from '../customer-links/customer-links.module';
import { Garage } from '../garages/entities/garage.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { JobStatusHistory } from '../job-cards/entities/job-status-history.entity';
import { Problem } from '../job-cards/entities/problem.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { EstimatesController } from './controllers/estimates.controller';
import { EstimateLineItem } from './entities/estimate-line-item.entity';
import { Estimate } from './entities/estimate.entity';
import { EstimatesService } from './services/estimates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Estimate,
      EstimateLineItem,
      JobCard,
      JobStatusHistory,
      Problem,
      Garage,
    ]),
    AuditModule,
    CustomerLinksModule,
    NotificationsModule,
  ],
  controllers: [EstimatesController],
  providers: [EstimatesService],
  // CustomerPortalModule delegates link responses to respondViaLink().
  exports: [EstimatesService],
})
export class EstimatesModule {}
