import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffController } from './controllers/staff.controller';
import { User } from './entities/user.entity';
import { StaffService } from './services/staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule, AuditModule, NotificationsModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
