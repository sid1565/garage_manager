export interface IFindAllQuery {
  limit: number;
  offset: number;
  search: string;
  order: { [key: string]: 'ASC' | 'DESC' };
}
