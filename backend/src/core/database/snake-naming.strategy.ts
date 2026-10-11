import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

const toSnake = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();

/** Maps camelCase entity properties to snake_case DB columns. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(className: string, customName?: string): string {
    return customName ?? toSnake(className);
  }

  columnName(propertyName: string, customName: string | undefined, prefixes: string[]): string {
    return toSnake(prefixes.concat(customName ?? propertyName).join('_'));
  }

  relationName(propertyName: string): string {
    return toSnake(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnake(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return toSnake(`${firstTableName}_${firstPropertyName.replace(/\./g, '_')}_${secondTableName}`);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnake(`${tableName}_${columnName ?? propertyName}`);
  }
}
