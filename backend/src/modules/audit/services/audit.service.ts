import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { ActorType } from '../enums/actor-type.enum';

export interface IAuditEntry {
  garageId: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/** NFR-7 — append-only audit trail. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>) {}

  /**
   * Pass the transaction's EntityManager so the audit row commits atomically
   * with the change it describes. Without one, writes standalone (e.g. failed logins).
   */
  async record(entry: IAuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.auditRepo;
    await repo.save(
      repo.create({
        garageId: entry.garageId,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changes: entry.changes ?? null,
        ipAddress: entry.ipAddress ?? null,
      }),
    );
    this.logger.debug(`audit ${entry.action} ${entry.entityType}:${entry.entityId ?? '-'}`);
  }
}
