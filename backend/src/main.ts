// Load .env before any module is imported — decorator-time constants (throttle limits) read it.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  configureApp(app);

  if (config.get<boolean>('swaggerEnabled')) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  app.enableShutdownHooks();
  const port = config.get<number>('port', 4000);
  await app.listen(port);
  logger.log(
    `API listening on http://localhost:${port}/${config.get<string>('apiPrefix')} (docs: /docs)`,
  );
}

void bootstrap();
