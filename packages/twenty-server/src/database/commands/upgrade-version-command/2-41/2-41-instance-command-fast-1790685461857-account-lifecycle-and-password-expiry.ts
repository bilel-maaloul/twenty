import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.41.0', 1790685461857)
export class AccountLifecycleAndPasswordExpiryFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."userWorkspace" ADD "lastHumanInteractiveActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()');
    await queryRunner.query('ALTER TABLE "core"."userWorkspace" ADD "suspendedAt" TIMESTAMP WITH TIME ZONE');
    await queryRunner.query('ALTER TABLE "core"."user" ADD "permanentPasswordExpiresAt" TIMESTAMP WITH TIME ZONE');
    await queryRunner.query(`UPDATE "core"."user"
      SET "permanentPasswordExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '90 days'
      WHERE "passwordHash" IS NOT NULL
        AND "mustChangePassword" = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."user" DROP COLUMN "permanentPasswordExpiresAt"');
    await queryRunner.query('ALTER TABLE "core"."userWorkspace" DROP COLUMN "suspendedAt"');
    await queryRunner.query('ALTER TABLE "core"."userWorkspace" DROP COLUMN "lastHumanInteractiveActivityAt"');
  }
}
