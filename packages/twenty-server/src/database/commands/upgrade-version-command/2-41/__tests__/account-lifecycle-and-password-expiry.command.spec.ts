import { AccountLifecycleAndPasswordExpiryFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-41/2-41-instance-command-fast-1790685461857-account-lifecycle-and-password-expiry';

describe('AccountLifecycleAndPasswordExpiryFastInstanceCommand', () => {
  it('adds membership state and gives existing permanent passwords a grace period', async () => {
    const queryRunner = { query: jest.fn() };

    await new AccountLifecycleAndPasswordExpiryFastInstanceCommand().up(
      queryRunner as never,
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(4);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "core"."userWorkspace" ADD "lastHumanInteractiveActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()',
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE "core"."userWorkspace" ADD "suspendedAt" TIMESTAMP WITH TIME ZONE',
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'ALTER TABLE "core"."user" ADD "permanentPasswordExpiresAt" TIMESTAMP WITH TIME ZONE',
    );
    expect(queryRunner.query.mock.calls[3][0]).toContain(
      `SET "permanentPasswordExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '90 days'`,
    );
    expect(queryRunner.query.mock.calls[3][0]).toContain(
      'WHERE "passwordHash" IS NOT NULL',
    );
    expect(queryRunner.query.mock.calls[3][0]).toContain(
      'AND "mustChangePassword" = false',
    );
  });

  it('removes only the added columns on rollback', async () => {
    const queryRunner = { query: jest.fn() };

    await new AccountLifecycleAndPasswordExpiryFastInstanceCommand().down(
      queryRunner as never,
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "core"."user" DROP COLUMN "permanentPasswordExpiresAt"',
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'ALTER TABLE "core"."userWorkspace" DROP COLUMN "suspendedAt"',
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'ALTER TABLE "core"."userWorkspace" DROP COLUMN "lastHumanInteractiveActivityAt"',
    );
  });
});
