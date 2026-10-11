import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerAccessLink } from './entities/customer-access-link.entity';
import { CustomerLinkGuard } from './guards/customer-link.guard';
import { CustomerLinkService } from './services/customer-link.service';

/**
 * Vehicle-owner link tokens (NFR-5): creation/revocation for estimates and notifications,
 * and the guard + decorators that authenticate public portal routes. A leaf module —
 * it imports no feature modules, so anything may depend on it without cycles.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CustomerAccessLink])],
  providers: [CustomerLinkService, CustomerLinkGuard],
  exports: [CustomerLinkService, CustomerLinkGuard],
})
export class CustomerLinksModule {}
