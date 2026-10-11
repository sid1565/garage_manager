import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AppImmutableEntity } from '../../../common/entities/app-base.entity';
import { User } from '../../staff/entities/user.entity';

/**
 * ENT-16 — opaque rotating refresh tokens, stored as SHA-256 hashes (NFR-4).
 * All tokens from one login share a `familyId`; reusing a rotated token revokes
 * the whole family (AC-2.5).
 */
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user', ['userId'])
@Index('IDX_refresh_tokens_family', ['familyId'])
export class RefreshToken extends AppImmutableEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** hex SHA-256 of the raw token. */
  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Set when rotated; a later presentation of this token is a reuse attack. */
  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  createdByIp: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;
}
