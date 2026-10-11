import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Garage } from '../garages/entities/garage.entity';
import { Payment } from '../invoices/entities/payment.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { Problem } from '../job-cards/entities/problem.entity';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobCard, Problem, Payment, Garage])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
