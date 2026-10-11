import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty({ example: 'Record fetched successfully' })
  message: string;

  data: T;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ example: 200 })
  status: number;

  @ApiProperty()
  message: string;

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;

  data: T[];
}
