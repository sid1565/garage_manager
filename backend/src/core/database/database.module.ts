import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IAppConfig } from '../config/configuration';
import { buildTypeOrmOptions } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config.getOrThrow<IAppConfig['db']>('db')),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
