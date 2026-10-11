import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PersonRefDto } from './job-card.dto';

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) jobCardId: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) problemId: string | null;
  @ApiProperty({ example: 'brake-pad.jpg' }) originalName: string;
  @ApiProperty({ example: 'image/jpeg' }) mimeType: string;
  @ApiProperty({ example: 482133 }) sizeBytes: number;
  @ApiProperty({ nullable: true, type: String, example: 'Front left pad' }) caption: string | null;
  @ApiProperty({ type: PersonRefDto }) uploadedBy: PersonRefDto;
  @ApiProperty() createdAt: Date;
}

/**
 * Multipart fields sent alongside `file` (POST /job-cards/:job_card_id/attachments).
 * File rules: ≤ 5 MB, jpeg/png/webp/pdf; the service also checks magic bytes (R-9)
 * and ≤ 10 attachments per problem.
 */
export class UploadAttachmentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Problem this photo belongs to' })
  @IsOptional()
  @IsUUID('4')
  problemId?: string;

  @ApiPropertyOptional({ example: 'Front left pad' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  caption?: string;
}
