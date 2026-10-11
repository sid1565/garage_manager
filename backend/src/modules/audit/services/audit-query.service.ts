import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { SUCCESS } from '../../../common/constants/messages';
import { IAuthUser, IPaginatedData, IServiceResult } from '../../../common/interfaces';
import { applyOrder, likeTerm } from '../../../common/utils/query.util';
import { requireGarageId } from '../../../common/utils/tenant.util';
import { AuditLogDto, ListAuditLogsQueryDto } from '../dto/audit-log.dto';
import { AuditLog } from '../entities/audit-log.entity';

const ORDER_COLUMNS = new Map([['createdAt', 'a.createdAt']]);

/** Read side of NFR-7. Strictly the caller's garage; platform rows (garage NULL) never leak. */
@Injectable()
export class AuditQueryService {
  private readonly logger = new Logger(AuditQueryService.name);

  constructor(
    private readonly i18n: I18nService,
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async list(
    user: IAuthUser,
    query: ListAuditLogsQueryDto,
    lang: string,
  ): Promise<IServiceResult<IPaginatedData<AuditLogDto>>> {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actorUser', 'u')
      .where('a.garage_id = :garageId', { garageId: requireGarageId(user) });
    if (query.entityType)
      qb.andWhere('a.entity_type = :entityType', { entityType: query.entityType });
    if (query.entityId) qb.andWhere('a.entity_id = :entityId', { entityId: query.entityId });
    if (query.actorUserId)
      qb.andWhere('a.actor_user_id = :actorUserId', { actorUserId: query.actorUserId });
    if (query.actorType) qb.andWhere('a.actor_type = :actorType', { actorType: query.actorType });
    if (query.from) qb.andWhere('a.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.created_at <= :to', { to: query.to });
    if (query.search) qb.andWhere('a.action ILIKE :term', { term: likeTerm(query.search) });
    applyOrder(qb, query.order, ORDER_COLUMNS, ['a.createdAt', 'DESC']);
    const [rows, total] = await qb.skip(query.offset).take(query.limit).getManyAndCount();
    return {
      message: SUCCESS.RECORD_LIST_FETCHED('AUDIT_LOG', this.i18n, lang),
      data: {
        items: rows.map((a) => ({
          id: a.id,
          actorType: a.actorType,
          actor: a.actorUser ? { id: a.actorUser.id, name: a.actorUser.name } : null,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          changes: a.changes,
          ipAddress: a.ipAddress,
          createdAt: a.createdAt,
        })),
        total,
      },
    };
  }
}
