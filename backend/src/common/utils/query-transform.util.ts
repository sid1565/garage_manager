import { TransformFnParams } from 'class-transformer';

/** ?flag=true → true; anything else → false. Use with @Transform on boolean query params. */
export const toBoolean = ({ value }: TransformFnParams): boolean =>
  value === true || value === 'true' || value === '1';

/** ?status=A&status=B or ?status=A,B → ['A','B']. */
export const toArray = ({ value }: TransformFnParams): unknown[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const list: unknown[] = Array.isArray(value) ? value : [value];
  return list.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v])).filter((v) => v !== '');
};
