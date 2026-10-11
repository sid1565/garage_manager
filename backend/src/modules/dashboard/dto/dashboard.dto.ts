import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobCardStatus } from '../../job-cards/enums/job-card-status.enum';
import { ProblemCategory } from '../../job-cards/enums/problem-category.enum';

export class StatusCountDto {
  @ApiProperty({ enum: JobCardStatus }) status: JobCardStatus;
  @ApiProperty({ example: 3 }) count: number;
}

export class CategoryCountDto {
  @ApiProperty({ enum: ProblemCategory }) category: ProblemCategory;
  @ApiProperty({ example: 12 }) count: number;
}

export class RevenueDto {
  @ApiProperty({ example: '18450.00', description: 'Sum of payments received today (garage tz)' })
  today: string;
  @ApiProperty({ example: '312900.00' }) thisMonth: string;
  @ApiProperty({ example: 'INR' }) currency: string;
}

/** GET /dashboard/summary (UC-17). */
export class DashboardSummaryDto {
  @ApiProperty({ type: [StatusCountDto], description: 'Open (non-terminal) jobs by status' })
  jobsByStatus: StatusCountDto[];
  @ApiProperty({ example: 14 }) openJobs: number;
  @ApiProperty({ example: 4, description: 'Open jobs promised for today' }) dueToday: number;
  @ApiProperty({ example: 2, description: 'Open jobs past promised delivery' }) overdue: number;
  @ApiProperty({ example: 3 }) awaitingApproval: number;
  @ApiProperty({ example: 1 }) readyForPickup: number;
  @ApiProperty({ type: [CategoryCountDto], description: 'Top 5, last 30 days' })
  topProblemCategories: CategoryCountDto[];
  /** Present ONLY for roles with DASHBOARD_REVENUE (AC-17.2) — the key is omitted otherwise. */
  @ApiPropertyOptional({ type: RevenueDto }) revenue?: RevenueDto;
}
