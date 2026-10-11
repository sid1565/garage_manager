import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthHardening1791448770061 implements MigrationInterface {
  name = 'AuthHardening1791448770061';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "failed_login_attempts" smallint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "locked_until" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "must_change_password" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "must_change_password"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "locked_until"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "failed_login_attempts"`);
  }
}
