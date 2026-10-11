import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppBaseEntity } from '../../../common/entities/app-base.entity';
import { RecordStatus, UserRole } from '../../../common/enums';
import { Garage } from '../../garages/entities/garage.entity';

/**
 * ENT-2 — staff accounts (GARAGE_ADMIN / SERVICE_ADVISOR / MECHANIC) and
 * platform operators (PLATFORM_ADMIN, the only role without a garage).
 */
@Entity('users')
@Check('CHK_users_garage_matches_role', `("role" = 'PLATFORM_ADMIN') = ("garage_id" IS NULL)`)
@Index('IDX_users_garage_role', ['garageId', 'role'])
export class User extends AppBaseEntity {
  @Column({ type: 'uuid', nullable: true })
  garageId: string | null;

  @ManyToOne(() => Garage, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'garage_id' })
  garage: Garage | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** citext → unique regardless of letter case (platform-wide, ENT-2). */
  @Column({ type: 'citext', unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** bcrypt hash; never selected unless explicitly requested. */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: RecordStatus,
    enumName: 'record_status',
    default: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Tokens issued before this instant are rejected (password change / forced logout). */
  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  /** Consecutive failed logins; reset on success. 5 → locked for 15 min. */
  @Column({ type: 'smallint', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  /** Set for admin-issued temporary passwords (UC-3); cleared by change-password. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;
}
