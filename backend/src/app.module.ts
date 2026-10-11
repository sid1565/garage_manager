import * as path from 'path';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AcceptLanguageResolver, HeaderResolver, I18nModule } from 'nestjs-i18n';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration, { IAppConfig } from './core/config/configuration';
import { envValidationSchema } from './core/config/env.validation';
import { DatabaseModule } from './core/database/database.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { SectionGuard } from './core/guards/section.guard';
import { UserAuthGuard } from './core/guards/user-auth.guard';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerLinksModule } from './modules/customer-links/customer-links.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { GaragesModule } from './modules/garages/garages.module';
import { HealthModule } from './modules/health/health.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { JobCardsModule } from './modules/job-cards/job-cards.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StaffModule } from './modules/staff/staff.module';
import { StorageModule } from './modules/storage/storage.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: { path: path.join(__dirname, 'i18n'), watch: false },
      resolvers: [new HeaderResolver(['x-lang']), AcceptLanguageResolver],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwt = config.getOrThrow<IAppConfig['jwt']>('jwt');
        return {
          privateKey: jwt.privateKey,
          publicKey: jwt.publicKey,
          // Algorithm pinned on both sides — blocks alg=none / HS-with-public-key confusion.
          signOptions: {
            algorithm: 'ES256',
            keyid: jwt.keyId,
            issuer: jwt.issuer,
            audience: jwt.audience,
            expiresIn: jwt.accessExpiresIn,
          },
          verifyOptions: { algorithms: ['ES256'], issuer: jwt.issuer, audience: jwt.audience },
        };
      },
    }),
    // NFR-4: global limit per IP; auth and portal routes add stricter @Throttle limits.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'default', ttl: 60_000, limit: config.get<number>('security.throttleLimit', 100) },
      ],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    AuditModule,
    StorageModule,
    AuthModule,
    GaragesModule,
    StaffModule,
    CustomersModule,
    VehiclesModule,
    JobCardsModule,
    EstimatesModule,
    NotificationsModule,
    CustomerLinksModule,
    CustomerPortalModule,
    InvoicesModule,
    DashboardModule,
  ],
  providers: [
    // Registered here (not in main.ts) so test apps get identical behaviour.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // Order matters: throttle → authenticate → authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: UserAuthGuard },
    { provide: APP_GUARD, useClass: SectionGuard },
  ],
})
export class AppModule {}
