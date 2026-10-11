import { QueryFailedError } from 'typeorm';

interface IPgDriverError {
  code?: string;
  constraint?: string;
}

const driverError = (error: unknown): IPgDriverError | undefined =>
  error instanceof QueryFailedError ? (error.driverError as IPgDriverError) : undefined;

/** Postgres unique_violation (23505), optionally on a specific constraint/index name. */
export const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  const pg = driverError(error);
  return pg?.code === '23505' && (!constraint || pg.constraint === constraint);
};
