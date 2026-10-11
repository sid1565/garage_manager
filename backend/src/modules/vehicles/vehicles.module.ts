import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Customer } from '../customers/entities/customer.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { Problem } from '../job-cards/entities/problem.entity';
import { VehiclesController } from './controllers/vehicles.controller';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclesService } from './services/vehicles.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, Customer, JobCard, Problem, Invoice]), AuditModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
