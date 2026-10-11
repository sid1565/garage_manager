import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CustomersController } from './controllers/customers.controller';
import { Customer } from './entities/customer.entity';
import { CustomersService } from './services/customers.service';
import { JobCard } from '../job-cards/entities/job-card.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Vehicle, JobCard]), AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
