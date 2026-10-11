import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CustomerLinksModule } from '../customer-links/customer-links.module';
import { Garage } from '../garages/entities/garage.entity';
import { GaragesModule } from '../garages/garages.module';
import { EstimateLineItem } from '../estimates/entities/estimate-line-item.entity';
import { Estimate } from '../estimates/entities/estimate.entity';
import { GarageCounter } from '../garages/entities/garage-counter.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoicesController } from './controllers/invoices.controller';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { Invoice } from './entities/invoice.entity';
import { Payment } from './entities/payment.entity';
import { InvoicesService } from './services/invoices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      InvoiceLineItem,
      Payment,
      JobCard,
      Estimate,
      EstimateLineItem,
      GarageCounter,
      Garage,
    ]),
    GaragesModule,
    CustomerLinksModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
