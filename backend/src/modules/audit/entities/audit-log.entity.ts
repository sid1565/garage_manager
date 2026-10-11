import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { Garage } from '../../garages/entities/garage.entity';
import { User } from '../../staff/entities/user.entity';
import { ActorType } from '../enums/actor-type.enum';

/**
 * ENT-15 — append-only (NFR-7). Written with the caller's EntityManager so it
 * commits atomically with the change it describes.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_garage_created', ['garageId', 'createdAt'])
@Index('IDX_audit_logs_entity', ['entityType', 'entityId'])
export class AuditLog extends AppImmutableEntity {
  /** null for platform-level actions (UC-19). */
  @Column({ type: 'uuid', nullable: true })
  garageId: string | null;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage | null;

  @Column({ type: 'enum', enum: ActorType, enumName: 'actor_type' })
  actorType: ActorType;

  /** Staff actor; null for CUSTOMER (link) and SYSTEM actions. */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  /** Dotted verb, e.g. "job_card.status_changed", "estimate.approved_verbally". */
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 50 })
  entityType: string;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  /** { before, after } summary — never contains secrets or password hashes. */
  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;
}
