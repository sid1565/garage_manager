import 'dotenv/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { buildTypeOrmOptions } from './typeorm.config';

/** CLI data source used by the migration:* scripts in package.json. */
export default new DataSource(buildTypeOrmOptions(configuration().db));
