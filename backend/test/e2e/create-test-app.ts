import 'dotenv/config';
import { Type } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

/** Boots the real AppModule (+ optional test-only controllers) with production middleware. */
export const createTestApp = async (
  extraControllers: Type<unknown>[] = [],
  extraImports: Type<unknown>[] = [],
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<NestExpressApplication> => {
  const moduleRef = await configure(
    Test.createTestingModule({
      imports: [AppModule, ...extraImports],
      controllers: extraControllers,
    }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
};
