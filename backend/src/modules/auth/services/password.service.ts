import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/** bcrypt wrapper (NFR-4: cost ≥ 12). No custom crypto. */
@Injectable()
export class PasswordService {
  private readonly rounds: number;
  /** Compared against when the user doesn't exist, so response time doesn't reveal it. */
  private readonly dummyHash: string;

  constructor(config: ConfigService) {
    this.rounds = config.get<number>('security.bcryptRounds', 12);
    this.dummyHash = bcrypt.hashSync('timing-equaliser-not-a-password', this.rounds);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string | null | undefined): Promise<boolean> {
    return bcrypt.compare(plain, hash ?? this.dummyHash);
  }
}
