import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { IFindAllQuery } from '../interfaces/find-all-query.interface';

export class FindAllQueryDto implements IFindAllQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({ default: '' })
  @IsOptional()
  @IsString()
  search: string = '';

  // ?order={"createdAt":"DESC"}  OR  ?order[createdAt]=DESC
  @ApiPropertyOptional({ example: '{"createdAt":"DESC"}' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value; // left as a string so @IsObject() rejects it with a 400
    }
  })
  @IsObject()
  order: { [key: string]: 'ASC' | 'DESC' } = { createdAt: 'DESC' };
}
