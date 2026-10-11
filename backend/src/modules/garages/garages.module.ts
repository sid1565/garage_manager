import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { User } from '../staff/entities/user.entity';
import { AdminGaragesController } from './controllers/admin-garages.controller';
import { GaragesController } from './controllers/garages.controller';
import { GarageCounter } from './entities/garage-counter.entity';
import { Garage } from './entities/garage.entity';
import { GarageCounterService } from './services/garage-counter.service';
import { GaragesService } from './services/garages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Garage, GarageCounter, User]), AuditModule],
  controllers: [GaragesController, AdminGaragesController],
  providers: [GaragesService, GarageCounterService],
  exports: [GaragesService, GarageCounterService],
})
export class GaragesModule {}
