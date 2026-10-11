import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CsrfOriginGuard } from '../../core/guards/csrf-origin.guard';
import { AuditModule } from '../audit/audit.module';
import { Garage } from '../garages/entities/garage.entity';
import { User } from '../staff/entities/user.entity';
import { AuthController } from './controllers/auth.controller';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Garage, RefreshToken]), AuditModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, CsrfOriginGuard],
  // Staff module needs PasswordService (temp passwords) and TokenService (revoke on deactivate).
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
