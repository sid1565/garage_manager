import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProblemCategory } from '../enums/problem-category.enum';
import { ProblemSeverity } from '../enums/problem-severity.enum';
import { AttachmentDto } from './attachment.dto';
import { PersonRefDto } from './job-card.dto';

export class ProblemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) jobCardId: string;
  @ApiProperty({ example: 'Front brake pads worn' }) title: string;
  @ApiProperty({ nullable: true, type: String, example: '2 mm left, disc scored' })
  description: string | null;
  @ApiProperty({ enum: ProblemSeverity }) severity: ProblemSeverity;
  @ApiProperty({ enum: ProblemCategory }) category: ProblemCategory;
  @ApiProperty() requiresNewEstimate: boolean;
  /** true once the problem is on a SENT/APPROVED estimate — edit/delete then return 409. */
  @ApiProperty() locked: boolean;
  @ApiProperty({ type: PersonRefDto }) recordedBy: PersonRefDto;
  @ApiProperty({ type: [AttachmentDto] }) attachments: AttachmentDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/** POST /job-cards/:job_card_id/problems (UC-9). */
export class CreateProblemDto {
  @ApiProperty({ example: 'Front brake pads worn' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: '2 mm left, disc scored' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: ProblemSeverity, example: ProblemSeverity.HIGH })
  @IsEnum(ProblemSeverity)
  severity: ProblemSeverity;

  @ApiProperty({ enum: ProblemCategory, example: ProblemCategory.BRAKES })
  @IsEnum(ProblemCategory)
  category: ProblemCategory;
}

/** PATCH /job-cards/:job_card_id/problems/:problem_id. */
export class UpdateProblemDto extends PartialType(CreateProblemDto) {
  @ApiPropertyOptional({ description: 'Mark as found during repair (UC-9 1b)' })
  @IsOptional()
  @IsBoolean()
  requiresNewEstimate?: boolean;
}
