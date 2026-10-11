import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AllowedOrderKeys } from '../../../common/decorators';
import { FindAllQueryDto } from '../../../common/dto/find-all-query.dto';
import { ActorType } from '../enums/actor-type.enum';

export class AuditActorDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Priya Joshi' }) name: string;
}

export class AuditLogDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ActorType }) actorType: ActorType;
  @ApiProperty({ type: AuditActorDto, nullable: true }) actor: AuditActorDto | null;
  @ApiProperty({ example: 'job_card.status_changed' }) action: string;
  @ApiProperty({ example: 'job_card' }) entityType: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) entityId: string | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    example: { before: { status: 'APPROVED' }, after: { status: 'IN_PROGRESS' } },
  })
  changes: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: String, example: '203.0.113.7' }) ipAddress: string | null;
  @ApiProperty() createdAt: Date;
}

/** GET /audit-logs — newest first; search: action. */
@AllowedOrderKeys(['createdAt'])
export class ListAuditLogsQueryDto extends FindAllQueryDto {
  @ApiPropertyOptional({ example: 'job_card' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') entityId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID('4') actorUserId?: string;

  @ApiPropertyOptional({ enum: ActorType })
  @IsOptional()
  @IsEnum(ActorType)
  actorType?: ActorType;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
