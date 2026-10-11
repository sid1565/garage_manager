import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerLinksModule } from '../customer-links/customer-links.module';
import { Customer } from '../customers/entities/customer.entity';
import { EstimateLineItem } from '../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../estimates/entities/estimate.entity';
import { EstimatesModule } from '../estimates/estimates.module';
import { Garage } from '../garages/entities/garage.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Attachment } from '../job-cards/entities/attachment.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { JobStatusHistory } from '../job-cards/entities/job-status-history.entity';
import { Problem } from '../job-cards/entities/problem.entity';
import { StorageModule } from '../storage/storage.module';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { CustomerPortalController } from './controllers/customer-portal.controller';
import { CustomerPortalService } from './services/customer-portal.service';

/** Read models for the owner page come straight from repositories (read-only, link-scoped). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Garage,
      Customer,
      Vehicle,
      JobCard,
      JobStatusHistory,
      Problem,
      Attachment,
      Estimate,
      EstimateLineItem,
      Invoice,
    ]),
    CustomerLinksModule,
    EstimatesModule,
    StorageModule,
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService],
})
export class CustomerPortalModule {}
