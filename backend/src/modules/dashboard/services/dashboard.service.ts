import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource } from 'typeorm';
import { SUCCESS } from '../../../common/constants/messages';
import { SECTION_PERMISSIONS } from '../../../common/constants/section-permissions';
import { EUserModule } from '../../../common/enums';
import { IAuthUser, IServiceResult } from '../../../common/interfaces';
import { formatMinor, parseMinor } from '../../../common/utils/money.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { Garage } from '../../garages/entities/garage.entity';
import { Payment } from '../../invoices/entities/payment.entity';
import { JobCard } from '../../job-cards/entities/job-card.entity';
import { Problem } from '../../job-cards/entities/problem.entity';
import { JobCardStatus, TERMINAL_JOB_STATUSES } from '../../job-cards/enums/job-card-status.enum';
import { ProblemCategory } from '../../job-cards/enums/problem-category.enum';
import { DashboardSummaryDto, RevenueDto } from '../dto/dashboard.dto';

const TOP_CATEGORIES = 5;
const CATEGORY_WINDOW_DAYS = 30;

/** Postgres SUM(numeric) → normalised 2-dp string ("0" → "0.00"). */
const money = (value: string | null | undefined): string => formatMinor(parseMinor(value ?? '0'));

/**
 * UC-17. "Today" and "this month" are evaluated in the garage's timezone inside SQL
 * (AT TIME ZONE with a bound parameter). Revenue is only computed — and the key only
 * present — for roles holding DASHBOARD_REVENUE (AC-17.2).
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async summary(user: IAuthUser, lang: string): Promise<IServiceResult<DashboardSummaryDto>> {
    const garageId = requireGarageId(user);
    const garage = await this.dataSource
      .getRepository(Garage)
      .findOneOrFail({ where: { id: garageId } });
    const tz = garage.timezone;
    const jobs = this.dataSource.getRepository(JobCard);
    const open = { terminal: TERMINAL_JOB_STATUSES };

    const [byStatus, dueToday, overdue, categories] = await Promise.all([
      jobs
        .createQueryBuilder('j')
        .select('j.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .where('j.garage_id = :garageId AND j.status NOT IN (:...terminal)', { garageId, ...open })
        .groupBy('j.status')
        .getRawMany<{ status: JobCardStatus; count: number }>(),
      jobs
        .createQueryBuilder('j')
        .where('j.garage_id = :garageId AND j.status NOT IN (:...terminal)', { garageId, ...open })
        .andWhere(
          '(j.promised_delivery_at AT TIME ZONE :tz)::date = (now() AT TIME ZONE :tz)::date',
          { tz },
        )
        .getCount(),
      jobs
        .createQueryBuilder('j')
        .where('j.garage_id = :garageId AND j.status NOT IN (:...terminal)', { garageId, ...open })
        .andWhere('j.promised_delivery_at < now()')
        .getCount(),
      this.dataSource
        .getRepository(Problem)
        .createQueryBuilder('p')
        .innerJoin(JobCard, 'j', 'j.id = p.job_card_id')
        .select('p.category', 'category')
        .addSelect('COUNT(*)::int', 'count')
        .where('j.garage_id = :garageId', { garageId })
        .andWhere(`p.created_at > now() - make_interval(days => :days)`, {
          days: CATEGORY_WINDOW_DAYS,
        })
        .groupBy('p.category')
        .orderBy('count', 'DESC')
        .limit(TOP_CATEGORIES)
        .getRawMany<{ category: ProblemCategory; count: number }>(),
    ]);

    const countOf = (status: JobCardStatus): number =>
      byStatus.find((r) => r.status === status)?.count ?? 0;
    const data: DashboardSummaryDto = {
      jobsByStatus: byStatus.map((r) => ({ status: r.status, count: r.count })),
      openJobs: byStatus.reduce((sum, r) => sum + r.count, 0),
      dueToday,
      overdue,
      awaitingApproval: countOf(JobCardStatus.AWAITING_APPROVAL),
      readyForPickup: countOf(JobCardStatus.READY_FOR_PICKUP),
      topProblemCategories: categories.map((r) => ({ category: r.category, count: r.count })),
    };
    if (SECTION_PERMISSIONS[user.role]?.has(EUserModule.DASHBOARD_REVENUE)) {
      data.revenue = await this.revenue(garageId, tz, garage.currency);
    }
    return { message: SUCCESS.RECORD_FETCHED('DASHBOARD', this.i18n, lang), data };
  }

  private async revenue(garageId: string, tz: string, currency: string): Promise<RevenueDto> {
    const row = await this.dataSource
      .getRepository(Payment)
      .createQueryBuilder('p')
      .select(
        `SUM(p.amount) FILTER (WHERE (p.received_at AT TIME ZONE :tz)::date = (now() AT TIME ZONE :tz)::date)`,
        'today',
      )
      .addSelect(
        `SUM(p.amount) FILTER (WHERE date_trunc('month', p.received_at AT TIME ZONE :tz) = date_trunc('month', now() AT TIME ZONE :tz))`,
        'month',
      )
      .where('p.garage_id = :garageId', { garageId, tz })
      .getRawOne<{ today: string | null; month: string | null }>();
    return { today: money(row?.today), thisMonth: money(row?.month), currency };
  }
}
