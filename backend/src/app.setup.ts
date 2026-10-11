import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * HTTP-level hardening shared by main.ts and the e2e tests, so tests exercise the
 * exact production middleware stack. ValidationPipe, filter, interceptors and
 * guards are registered in AppModule.
 */
export const configureApp = (app: NestExpressApplication): void => {
  const config = app.get(ConfigService);
  app.setGlobalPrefix(config.get<string>('apiPrefix', 'api/v1'));

  // Behind a load balancer, trust its X-Forwarded-For so rate limits and audit IPs are per client.
  app.set('trust proxy', config.get<boolean | number>('security.trustProxy', false));
  app.disable('x-powered-by');

  // helmet defaults: HSTS, nosniff, frame-ancestors 'none', no-referrer, strict CSP for this JSON API.
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string[]>('corsOrigins', []), // explicit allow-list, never '*' with credentials
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept-Language',
      'X-Client-Type',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 600,
  });
};

export const buildOpenApiDocument = (app: NestExpressApplication): OpenAPIObject =>
  SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Garage Repair Management API')
      .setDescription('Garage staff, customers, vehicles, job cards, estimates, notifications')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
