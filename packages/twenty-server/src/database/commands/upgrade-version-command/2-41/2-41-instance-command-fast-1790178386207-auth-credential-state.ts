import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.41.0', 1790178386207)
export class AuthCredentialStateFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."user" ADD "mustChangePassword" boolean NOT NULL DEFAULT false');
    await queryRunner.query('ALTER TABLE "core"."user" ADD "temporaryPasswordExpiresAt" TIMESTAMP WITH TIME ZONE');
    await queryRunner.query('ALTER TABLE "core"."user" ADD "credentialEpoch" integer NOT NULL DEFAULT \'0\'');
    await queryRunner.query('ALTER TABLE "core"."userSession" ADD "credentialEpoch" integer NOT NULL DEFAULT \'0\'');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."userSession" DROP COLUMN "credentialEpoch"');
    await queryRunner.query('ALTER TABLE "core"."user" DROP COLUMN "credentialEpoch"');
    await queryRunner.query('ALTER TABLE "core"."user" DROP COLUMN "temporaryPasswordExpiresAt"');
    await queryRunner.query('ALTER TABLE "core"."user" DROP COLUMN "mustChangePassword"');
  }
}
