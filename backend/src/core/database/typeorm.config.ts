import { join } from 'path';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { IAppConfig } from '../config/configuration';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * Single source of TypeORM options for both the Nest app (DatabaseModule) and the
 * migration CLI (data-source.ts), so they always see the same entities and migrations.
 *
 * Schema changes go through migrations only — `synchronize` is hard-coded off.
 */
export const buildTypeOrmOptions = (db: IAppConfig['db']): PostgresConnectionOptions => ({
  type: 'postgres',
  host: db.host,
  port: db.port,
  username: db.username,
  password: db.password,
  database: db.name,
  logging: db.logging,
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  // UUID defaults use gen_random_uuid() (core since PG13) instead of uuid-ossp.
  uuidExtension: 'pgcrypto',
  entities: [join(__dirname, '..', '..', 'modules', '**', 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  // Run each migration in its own transaction so one failure doesn't roll back earlier ones.
  migrationsTransactionMode: 'each',
  migrationsRun: db.migrationsRun,
});
