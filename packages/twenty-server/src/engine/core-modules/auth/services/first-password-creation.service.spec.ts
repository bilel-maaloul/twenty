import * as crypto from 'node:crypto';

import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import {
  compareHash,
  hashPassword,
} from 'src/engine/core-modules/auth/auth.util';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { authGraphqlApiExceptionHandler } from 'src/engine/core-modules/auth/utils/auth-graphql-api-exception-handler.util';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import {
  FirstPasswordCreationService,
  FirstPasswordInputRejectedException,
} from 'src/engine/core-modules/auth/services/first-password-creation.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

jest.mock('node:crypto', () => {
  const actualCrypto =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');

  return {
    ...actualCrypto,
    randomInt: jest.fn(actualCrypto.randomInt),
  };
});

jest.setTimeout(30_000);

let dummyPasscodeHash: string;

beforeAll(async () => {
  dummyPasscodeHash = await hashPassword('test-only-dummy-passcode');
});

type StoredToken = Pick<
  AppTokenEntity,
  | 'id'
  | 'userId'
  | 'workspaceId'
  | 'type'
  | 'value'
  | 'expiresAt'
  | 'revokedAt'
  | 'deletedAt'
  | 'context'
>;

describe('FirstPasswordCreationService', () => {
  const temporaryPassword = 'Temporary-password-123';
  const permanentPassword = 'Permanent-password-123';

  const createScenario = async () => {
    let user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      passwordHash: string | null;
      isEmailVerified: boolean;
      disabled: boolean;
      mustChangePassword: boolean;
      temporaryPasswordExpiresAt: Date | null;
      permanentPasswordExpiresAt: Date | null;
      credentialEpoch: number;
      deletedAt: Date | null;
      canAccessFullAdminPanel: boolean;
      canImpersonate: boolean;
    } = {
      id: 'user-id',
      email: 'first@example.com',
      firstName: 'Old',
      lastName: 'Name',
      isEmailVerified: false,
      passwordHash: await hashPassword(temporaryPassword),
      disabled: false,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      permanentPasswordExpiresAt: null,
      credentialEpoch: 0,
      deletedAt: null,
      canAccessFullAdminPanel: false,
      canImpersonate: false,
    };
    let userWorkspace = {
      userId: 'user-id',
      workspaceId: 'workspace-id',
      suspendedAt: null as Date | null,
    };
    let tokens: StoredToken[] = [];
    let activeMemberships: Array<{ userId: string; workspaceId: string }> = [];
    let nextId = 0;
    let transactionQueue = Promise.resolve();
    const invalidation = jest.fn().mockResolvedValue(undefined);
    const userRepository = {
      findOne: jest.fn(async () => ({ ...user })),
      findOneBy: jest.fn(async () => ({ ...user })),
      update: jest.fn(
        async (
          where: Record<string, unknown>,
          values: Record<string, unknown>,
        ) => {
          if (
            Object.entries(where).some(
              ([key, value]) => user[key as keyof typeof user] !== value,
            )
          ) {
            return { affected: 0 };
          }

          user = {
            ...user,
            ...values,
            ...(typeof values.credentialEpoch === 'function' && {
              credentialEpoch: user.credentialEpoch + 1,
            }),
          } as typeof user;

          return { affected: 1 };
        },
      ),
      restore: jest.fn(async () => {
        user = { ...user, deletedAt: null };

        return { affected: 1 };
      }),
    };
    const appTokenRepository = {
      findOne: jest.fn(
        async ({
          where,
        }: {
          where: {
            id?: string;
            value?: string;
            type?: AppTokenType;
            userId?: string;
            workspaceId?: string;
            revokedAt?: unknown;
            deletedAt?: unknown;
          };
        }) =>
          tokens.find(
            (token) =>
              (where.id === undefined || token.id === where.id) &&
              (where.value === undefined || token.value === where.value) &&
              (where.type === undefined || token.type === where.type) &&
              (where.userId === undefined || token.userId === where.userId) &&
              (where.workspaceId === undefined ||
                token.workspaceId === where.workspaceId) &&
              (!where.revokedAt || !token.revokedAt) &&
              (!where.deletedAt || !token.deletedAt),
          ) ?? null,
      ),
      findOneBy: jest.fn(
        async ({ id }: { id: string }) =>
          tokens.find((token) => token.id === id) ?? null,
      ),
      update: jest.fn(
        async (
          where: {
            userId?: string;
            id?: string;
            type?: AppTokenType;
            credentialEpoch?: number;
          },
          values: { revokedAt: Date; expiresAt?: Date },
        ) => {
          tokens = tokens.map((token) =>
            (where.userId === undefined || token.userId === where.userId) &&
            (where.id === undefined || token.id === where.id) &&
            (where.type === undefined || token.type === where.type) &&
            !token.revokedAt
              ? {
                  ...token,
                  revokedAt: values.revokedAt,
                  ...(values.expiresAt && { expiresAt: values.expiresAt }),
                }
              : token,
          );
        },
      ),
      insert: jest.fn(
        async (values: Omit<StoredToken, 'id' | 'revokedAt' | 'deletedAt'>) => {
          tokens.push({
            ...values,
            id: `token-${++nextId}`,
            revokedAt: null,
            deletedAt: null,
          });
        },
      ),
    };
    const userWorkspaceRepository = {
      find: jest.fn(async () =>
        activeMemberships.map((membership) => ({ ...membership })),
      ),
      findOne: jest.fn(async ({ where }: { where: { userId: string } }) =>
        userWorkspace.userId === where.userId && !userWorkspace.suspendedAt
          ? { ...userWorkspace }
          : null,
      ),
    };
    const manager = {
      getRepository: jest.fn(
        (
          entity:
            | typeof UserEntity
            | typeof AppTokenEntity
            | typeof UserWorkspaceEntity,
        ) =>
          entity === UserEntity
            ? userRepository
            : entity === AppTokenEntity
              ? appTokenRepository
              : userWorkspaceRepository,
      ),
    };
    Object.assign(userRepository, { manager });
    const transaction = jest.fn(
      async (
        callback: (transactionManager: {
          getRepository: jest.Mock;
        }) => Promise<unknown>,
      ) => {
        const priorTransaction = transactionQueue;
        let release = () => {};

        transactionQueue = new Promise<void>((resolve) => {
          release = resolve;
        });
        await priorTransaction;
        const originalUser = { ...user };
        const originalTokens = tokens.map((token) => ({ ...token }));

        try {
          return await callback(manager);
        } catch (error) {
          user = originalUser;
          tokens = originalTokens;
          throw error;
        } finally {
          release();
        }
      },
    );
    const service = Object.assign(
      Object.create(FirstPasswordCreationService.prototype),
      {
        dummyPasscodeHash,
        appTokenRepository: { ...appTokenRepository, manager: { transaction } },
        userRepository,
        throttlerService: {
          tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(undefined),
        },
        twentyConfigService: {
          get: () => '5m',
        },
        authService: {
          invalidateCredentialsAfterPasswordChange: invalidation,
        } as Pick<AuthService, 'invalidateCredentialsAfterPasswordChange'>,
        coreEntityCacheService: {
          invalidate: jest.fn().mockResolvedValue(undefined),
        },
        logger: { error: jest.fn() },
      },
    ) as FirstPasswordCreationService;

    const issue = () =>
      service.issueCapability(user as UserEntity, temporaryPassword);

    return {
      service,
      issue,
      getUser: () => user,
      setUser: (changes: Partial<typeof user>) => {
        user = { ...user, ...changes };
      },
      setTokens: (newTokens: StoredToken[]) => {
        tokens = newTokens.map((token) => ({ ...token }));
      },
      setActiveMemberships: (
        memberships: Array<{ userId: string; workspaceId: string }>,
      ) => {
        activeMemberships = memberships.map((membership) => ({
          ...membership,
        }));
      },
      getTokens: () => tokens,
      transaction,
      manager,
      userRepository,
      appTokenRepository,
      userWorkspaceRepository,
      setUserWorkspace: (changes: Partial<typeof userWorkspace>) => {
        userWorkspace = { ...userWorkspace, ...changes };
      },
      invalidation,
    };
  };

  it('stores only a hash and holds the user lock before superseding tokens', async () => {
    const scenario = await createScenario();
    const first = await scenario.issue();
    const second = await scenario.issue();
    const [firstToken, secondToken] = scenario.getTokens();

    expect(firstToken.value).not.toBe(first.capability);
    expect(firstToken.value).toMatch(/^[a-f0-9]{64}$/);
    expect(firstToken.revokedAt).toBeInstanceOf(Date);
    expect(secondToken.revokedAt).toBeNull();
    expect(secondToken.context?.credentialEpoch).toBe(0);
    expect(secondToken.expiresAt.getTime()).toBeLessThanOrEqual(
      scenario.getUser().temporaryPasswordExpiresAt?.getTime() ?? 0,
    );
    expect(scenario.userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    await expect(
      scenario.service.createPermanentPassword(
        first.capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toThrow();
    await expect(
      scenario.service.createPermanentPassword(
        second.capability,
        permanentPassword,
        permanentPassword,
      ),
    ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 1 });
  });

  it('changes the password and epoch once, consumes the capability, and blocks replay', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    await scenario.service.createPermanentPassword(
      capability,
      permanentPassword,
      permanentPassword,
    );

    expect(
      await compareHash(permanentPassword, scenario.getUser().passwordHash),
    ).toBe(true);
    expect(scenario.getUser()).toEqual(
      expect.objectContaining({
        credentialEpoch: 1,
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        permanentPasswordExpiresAt: expect.any(Date),
      }),
    );
    expect(
      scenario.getUser().permanentPasswordExpiresAt!.getTime(),
    ).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
    expect(scenario.getTokens()[0].revokedAt).toBeInstanceOf(Date);
    expect(scenario.invalidation).toHaveBeenCalledWith('user-id');
    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toThrow();
  });

  it('serializes simultaneous issuance and consumption', async () => {
    const scenario = await createScenario();
    const [first, second] = await Promise.all([
      scenario.issue(),
      scenario.issue(),
    ]);

    expect(
      scenario.getTokens().filter((token) => !token.revokedAt),
    ).toHaveLength(1);
    await expect(
      scenario.service.createPermanentPassword(
        first.capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toThrow();
    const outcomes = await Promise.allSettled([
      scenario.service.createPermanentPassword(
        second.capability,
        permanentPassword,
        permanentPassword,
      ),
      scenario.service.createPermanentPassword(
        second.capability,
        permanentPassword,
        permanentPassword,
      ),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(scenario.getUser().credentialEpoch).toBe(1);
  });

  it.each([
    ['missing expiry', null],
    ['expiry at the current time', new Date(Date.now())],
    ['expired', new Date(Date.now() - 1000)],
  ])('rejects issuance with %s', async (_name, expiry) => {
    const scenario = await createScenario();

    scenario.setUser({ temporaryPasswordExpiresAt: expiry });

    await expect(scenario.issue()).rejects.toThrow();
    expect(scenario.getTokens()).toHaveLength(0);
  });

  it('rejects a rotated password between initial validation and issuance', async () => {
    const scenario = await createScenario();
    const initiallyValidatedUser = { ...scenario.getUser() };

    scenario.setUser({
      passwordHash: await hashPassword('rotated-temporary-password'),
      credentialEpoch: 1,
    });

    await expect(
      scenario.service.issueCapability(
        initiallyValidatedUser as UserEntity,
        temporaryPassword,
      ),
    ).rejects.toThrow();
  });

  it('rejects rotation, expiry, or disablement after issuance', async () => {
    for (const changes of [
      { credentialEpoch: 1 },
      { temporaryPasswordExpiresAt: new Date(Date.now() - 1000) },
      { disabled: true },
    ]) {
      const scenario = await createScenario();
      const { capability } = await scenario.issue();

      scenario.setUser(changes);

      await expect(
        scenario.service.createPermanentPassword(
          capability,
          permanentPassword,
          permanentPassword,
        ),
      ).rejects.toThrow();
    }
  });

  it.each([
    ['password mismatch', permanentPassword, 'different-permanent-password'],
    ['password policy failure', 'short', 'short'],
    ['missing uppercase letter', 'lowercase123', 'lowercase123'],
    ['missing number', 'UppercaseOnly', 'UppercaseOnly'],
    ['temporary-password reuse', temporaryPassword, temporaryPassword],
  ])(
    'retains a valid capability after %s and permits one subsequent success',
    async (_name, newPassword, confirmation) => {
      const scenario = await createScenario();
      const { capability, expiresAt } = await scenario.issue();

      await expect(
        scenario.service.createPermanentPassword(
          capability,
          newPassword,
          confirmation,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });
      expect(scenario.getUser().credentialEpoch).toBe(0);
      expect(scenario.getUser().mustChangePassword).toBe(true);
      expect(scenario.getTokens()[0].revokedAt).toBeNull();
      expect(scenario.getTokens()[0].expiresAt).toEqual(expiresAt);

      await expect(
        scenario.service.createPermanentPassword(
          capability,
          permanentPassword,
          permanentPassword,
        ),
      ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 1 });
      expect(scenario.getUser().credentialEpoch).toBe(1);
      await expect(
        scenario.service.createPermanentPassword(
          capability,
          permanentPassword,
          permanentPassword,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    },
  );

  it('checks capability validity before classifying invalid password input', async () => {
    const invalidCapabilityScenario = await createScenario();
    await invalidCapabilityScenario.issue();

    await expect(
      invalidCapabilityScenario.service.createPermanentPassword(
        crypto.randomBytes(32).toString('base64url'),
        permanentPassword,
        'mismatch',
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    expect(invalidCapabilityScenario.getTokens()[0].revokedAt).toBeNull();

    const expiredCapabilityScenario = await createScenario();
    const { capability: expiredCapability } =
      await expiredCapabilityScenario.issue();
    expiredCapabilityScenario.getTokens()[0].expiresAt = new Date(
      Date.now() - 1,
    );

    await expect(
      expiredCapabilityScenario.service.createPermanentPassword(
        expiredCapability,
        'short',
        'short',
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });

    const expiredTemporaryPasswordScenario = await createScenario();
    const { capability: expiredTemporaryPasswordCapability } =
      await expiredTemporaryPasswordScenario.issue();
    expiredTemporaryPasswordScenario.setUser({
      temporaryPasswordExpiresAt: new Date(Date.now() - 1),
    });

    await expect(
      expiredTemporaryPasswordScenario.service.createPermanentPassword(
        expiredTemporaryPasswordCapability,
        temporaryPassword,
        temporaryPassword,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
  });

  it('rejects revoked and superseded capabilities with the generic code', async () => {
    for (const change of [
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.getTokens()[0].revokedAt = new Date();
      },
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.setUser({ credentialEpoch: 1 });
      },
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.setUser({ disabled: true });
      },
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.setUser({ mustChangePassword: false });
      },
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.getTokens()[0].type = AppTokenType.RefreshToken;
      },
    ]) {
      const scenario = await createScenario();
      const { capability } = await scenario.issue();

      change(scenario);

      await expect(
        scenario.service.createPermanentPassword(capability, 'short', 'short'),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    }
  });

  it('revalidates authoritative state after a retained input failure', async () => {
    for (const change of [
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.setUser({ credentialEpoch: 1 });
      },
      (scenario: Awaited<ReturnType<typeof createScenario>>) => {
        scenario.setUser({ disabled: true });
      },
    ]) {
      const scenario = await createScenario();
      const { capability } = await scenario.issue();

      await expect(
        scenario.service.createPermanentPassword(
          capability,
          permanentPassword,
          'different-permanent-password',
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });

      change(scenario);

      await expect(
        scenario.service.createPermanentPassword(
          capability,
          permanentPassword,
          permanentPassword,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    }
  });

  it('rejects malformed, unknown, revoked, and expired capabilities', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    await expect(
      scenario.service.createPermanentPassword(
        crypto.randomBytes(32).toString('base64url'),
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    scenario.getTokens()[0].expiresAt = new Date(Date.now() - 1000);
    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    scenario.getTokens()[0].revokedAt = new Date();
    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
  });

  it('rejects mismatch, weak passwords, and temporary-password reuse', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    for (const [newPassword, confirmation] of [
      [permanentPassword, 'different-password'],
      ['short', 'short'],
      ['lowercase123', 'lowercase123'],
      ['UppercaseOnly', 'UppercaseOnly'],
      [temporaryPassword, temporaryPassword],
    ]) {
      await expect(
        scenario.service.createPermanentPassword(
          capability,
          newPassword,
          confirmation,
        ),
      ).rejects.toThrow();
    }
    expect(scenario.getUser().credentialEpoch).toBe(0);
  });

  it('rolls back password replacement when token revocation fails', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    scenario.appTokenRepository.update.mockRejectedValueOnce(
      new Error('database update failed'),
    );

    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.INTERNAL_SERVER_ERROR });
    expect(scenario.getUser().credentialEpoch).toBe(0);
    expect(scenario.getUser().mustChangePassword).toBe(true);
    expect(scenario.invalidation).not.toHaveBeenCalled();
  });

  it('returns an operational error when database validation fails before a write', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    scenario.userRepository.findOne.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.INTERNAL_SERVER_ERROR,
    });
    expect(scenario.userRepository.update).not.toHaveBeenCalled();
    expect(scenario.getTokens()[0].revokedAt).toBeNull();
  });

  it('reports a committed change as success when post-commit cleanup has a failure', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    scenario.invalidation.mockRejectedValueOnce(new Error('cache unavailable'));

    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 1 });
  });

  it('reconciles a lost transaction commit acknowledgement before reporting success', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    scenario.transaction.mockImplementationOnce(async (callback) => {
      await callback(scenario.manager);
      throw new Error('commit acknowledgement lost');
    });

    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 1 });
    expect(scenario.getUser().credentialEpoch).toBe(1);
    expect(scenario.invalidation).toHaveBeenCalledWith('user-id');
  });

  it('reports an unknown outcome when the database cannot establish commit state', async () => {
    const scenario = await createScenario();
    const { capability } = await scenario.issue();

    scenario.transaction.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    scenario.userRepository.findOneBy.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      scenario.service.createPermanentPassword(
        capability,
        permanentPassword,
        permanentPassword,
      ),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.INTERNAL_SERVER_ERROR,
    });
    expect(scenario.invalidation).not.toHaveBeenCalled();
  });

  it('keeps GraphQL error codes distinct for password input and invalid capability', () => {
    const invokeErrorMapper = (exception: AuthException): unknown => {
      try {
        authGraphqlApiExceptionHandler(exception);
      } catch (error) {
        return error;
      }

      return undefined;
    };

    expect(
      invokeErrorMapper(new FirstPasswordInputRejectedException()),
    ).toMatchObject({
      extensions: {
        code: ErrorCode.BAD_USER_INPUT,
        subCode: AuthExceptionCode.INVALID_INPUT,
      },
    });
    expect(
      invokeErrorMapper(
        new AuthException(
          'First-password capability is invalid or expired',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        ),
      ),
    ).toMatchObject({
      extensions: {
        code: ErrorCode.FORBIDDEN,
        subCode: AuthExceptionCode.FORBIDDEN_EXCEPTION,
      },
    });
    expect(
      invokeErrorMapper(
        new AuthException(
          'First-password creation failed',
          AuthExceptionCode.INTERNAL_SERVER_ERROR,
        ),
      ),
    ).toMatchObject({ code: ErrorCode.INTERNAL_SERVER_ERROR });
  });

  describe('deleted identity restoration', () => {
    it('reuses the identity, clears old credentials, invalidates tokens and completes invitation onboarding', async () => {
      const scenario = await createScenario();
      scenario.setUser({
        deletedAt: new Date(),
        passwordHash: await hashPassword('Old-permanent-password-123'),
        mustChangePassword: false,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
        permanentPasswordExpiresAt: new Date(Date.now() + 60_000),
        credentialEpoch: 4,
        isEmailVerified: true,
      });
      scenario.setTokens([
        {
          id: 'old-refresh-token',
          userId: 'user-id',
          workspaceId: 'workspace-id',
          type: AppTokenType.RefreshToken,
          value: 'old-refresh-token-hash',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          deletedAt: null,
          context: null,
        },
        {
          id: 'old-invitation-token',
          userId: 'user-id',
          workspaceId: 'workspace-id',
          type: AppTokenType.InvitationToken,
          value: 'old-invitation-token-hash',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          deletedAt: null,
          context: null,
        },
      ]);

      const restoration =
        await scenario.service.restoreDeletedUserForInvitation({
          userId: 'user-id',
          firstName: 'Restored',
          lastName: 'Member',
        });

      expect(restoration.status).toBe('restored');
      expect(restoration).toMatchObject({
        user: {
          id: 'user-id',
          firstName: 'Restored',
          lastName: 'Member',
          passwordHash: null,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: null,
          permanentPasswordExpiresAt: null,
          credentialEpoch: 5,
          deletedAt: null,
          isEmailVerified: true,
        },
      });
      expect(scenario.userRepository.restore).toHaveBeenCalledWith({
        id: 'user-id',
      });
      expect(scenario.getTokens()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'old-refresh-token',
            revokedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
          expect.objectContaining({
            id: 'old-invitation-token',
            revokedAt: expect.any(Date),
            expiresAt: expect.any(Date),
          }),
        ]),
      );
      expect(scenario.invalidation).toHaveBeenCalledWith('user-id');

      scenario.setActiveMemberships([
        { userId: 'user-id', workspaceId: 'workspace-id' },
      ]);
      const invitation = await scenario.service.issueInvitationPasscode({
        userId: 'user-id',
        workspaceId: 'workspace-id',
      });
      const passcodeToken = scenario
        .getTokens()
        .find(
          ({ type, revokedAt }) =>
            type === AppTokenType.FirstPasswordInvitationPasscode && !revokedAt,
        );

      expect(invitation.passcode).toMatch(/^\d{6}$/);
      expect(passcodeToken).toBeDefined();
      expect(passcodeToken?.value).not.toBe(invitation.passcode);
      expect(await compareHash(invitation.passcode, passcodeToken!.value)).toBe(
        true,
      );

      const capability = await scenario.service.verifyInvitationPasscode({
        email: 'first@example.com',
        workspaceId: 'workspace-id',
        passcode: invitation.passcode,
        ipAddress: '203.0.113.44',
      });

      await expect(
        scenario.service.createPermanentPassword(
          capability.capability,
          permanentPassword,
          permanentPassword,
        ),
      ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 6 });
      expect(scenario.getUser()).toMatchObject({
        passwordHash: expect.any(String),
        mustChangePassword: false,
        credentialEpoch: 6,
      });
      expect(scenario.invalidation).toHaveBeenCalledTimes(2);
    });

    it('does not restore disabled or server-privileged identities', async () => {
      for (const changes of [
        { disabled: true },
        { canAccessFullAdminPanel: true },
        { canImpersonate: true },
      ]) {
        const scenario = await createScenario();
        scenario.setUser({ deletedAt: new Date(), ...changes });

        await expect(
          scenario.service.restoreDeletedUserForInvitation({
            userId: 'user-id',
            firstName: 'Jane',
            lastName: 'Doe',
          }),
        ).resolves.toEqual({ status: 'unavailable' });

        expect(scenario.userRepository.restore).not.toHaveBeenCalled();
        expect(scenario.invalidation).not.toHaveBeenCalled();
      }
    });

    it('refuses restoration when the deleted identity still has active workspace memberships', async () => {
      const scenario = await createScenario();
      scenario.setUser({ deletedAt: new Date() });
      scenario.setActiveMemberships([
        { userId: 'user-id', workspaceId: 'unrelated-workspace-id' },
      ]);

      await expect(
        scenario.service.restoreDeletedUserForInvitation({
          userId: 'user-id',
          firstName: 'Jane',
          lastName: 'Doe',
        }),
      ).resolves.toEqual({ status: 'unavailable' });

      expect(scenario.userRepository.restore).not.toHaveBeenCalled();
      expect(scenario.invalidation).not.toHaveBeenCalled();
    });
  });

  describe('administrator invitation passcodes', () => {
    const issueInvitation = async (
      scenario: Awaited<ReturnType<typeof createScenario>>,
    ) => {
      scenario.setUser({
        passwordHash: null,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: null,
        isEmailVerified: false,
      });

      return await scenario.service.issueInvitationPasscode({
        userId: 'user-id',
        workspaceId: 'workspace-id',
      });
    };

    it('stores only a bcrypt hash scoped to the intended user, workspace, and credential epoch', async () => {
      const scenario = await createScenario();
      const invitation = await issueInvitation(scenario);
      const [storedToken] = scenario.getTokens();

      expect(invitation.passcode).toMatch(/^\d{6}$/);
      expect(storedToken).toMatchObject({
        userId: 'user-id',
        workspaceId: 'workspace-id',
        type: AppTokenType.FirstPasswordInvitationPasscode,
      });
      expect(storedToken.value).not.toBe(invitation.passcode);
      expect(await compareHash(invitation.passcode, storedToken.value)).toBe(
        true,
      );
      expect(storedToken.context).toEqual({
        email: 'first@example.com',
        credentialEpoch: 0,
      });
      expect(invitation.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 5 * 60 * 1000,
      );
    });

    it('preserves leading zeroes in generated invitation passcodes', async () => {
      jest.mocked(crypto.randomInt).mockReturnValueOnce(1234);

      const scenario = await createScenario();
      const invitation = await issueInvitation(scenario);

      expect(invitation.passcode).toBe('001234');
      expect(crypto.randomInt).toHaveBeenCalledWith(0, 1_000_000);

      const restricted = await scenario.service.verifyInvitationPasscode({
        email: 'first@example.com',
        workspaceId: 'workspace-id',
        passcode: '001234',
        ipAddress: '203.0.113.20',
      });

      expect(restricted.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('consumes the passcode once and returns only a restricted hash-backed capability', async () => {
      const scenario = await createScenario();
      const invitation = await issueInvitation(scenario);

      const restricted = await scenario.service.verifyInvitationPasscode({
        email: ' FIRST@example.com ',
        workspaceId: 'workspace-id',
        passcode: invitation.passcode,
        ipAddress: '203.0.113.20',
      });

      expect(restricted.capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(scenario.getTokens()[0]).toMatchObject({
        type: AppTokenType.FirstPasswordInvitationPasscode,
        revokedAt: expect.any(Date),
      });
      const capabilityToken = scenario.getTokens()[1];
      expect(capabilityToken).toMatchObject({
        userId: 'user-id',
        workspaceId: 'workspace-id',
        type: AppTokenType.FirstPasswordCreation,
        context: {
          credentialEpoch: 0,
          firstPasswordFlow: 'invitation-passcode',
        },
      });
      expect(capabilityToken.value).not.toBe(restricted.capability);
      expect(capabilityToken.value).toMatch(/^[a-f0-9]{64}$/);
      expect(scenario.getUser()).toMatchObject({
        passwordHash: null,
        mustChangePassword: true,
        isEmailVerified: true,
      });
      await expect(
        scenario.service.hasValidCapability(restricted.capability),
      ).resolves.toBe(true);
      expect(JSON.stringify(scenario.getTokens())).not.toContain(
        restricted.capability,
      );

      await expect(
        scenario.service.verifyInvitationPasscode({
          email: 'first@example.com',
          workspaceId: 'workspace-id',
          passcode: invitation.passcode,
          ipAddress: '203.0.113.20',
        }),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    });

    it('rejects wrong, expired, and superseded passcodes generically', async () => {
      const wrongScenario = await createScenario();
      await issueInvitation(wrongScenario);
      await expect(
        wrongScenario.service.verifyInvitationPasscode({
          email: 'first@example.com',
          workspaceId: 'workspace-id',
          passcode: '000000',
          ipAddress: '203.0.113.20',
        }),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });

      const expiredScenario = await createScenario();
      const expiredInvitation = await issueInvitation(expiredScenario);
      expiredScenario.getTokens()[0].expiresAt = new Date(Date.now() - 1);
      await expect(
        expiredScenario.service.verifyInvitationPasscode({
          email: 'first@example.com',
          workspaceId: 'workspace-id',
          passcode: expiredInvitation.passcode,
          ipAddress: '203.0.113.20',
        }),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });

      const supersededScenario = await createScenario();
      const oldInvitation = await issueInvitation(supersededScenario);
      await supersededScenario.service.issueInvitationPasscode({
        userId: 'user-id',
        workspaceId: 'workspace-id',
      });
      await expect(
        supersededScenario.service.verifyInvitationPasscode({
          email: 'first@example.com',
          workspaceId: 'workspace-id',
          passcode: oldInvitation.passcode,
          ipAddress: '203.0.113.20',
        }),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    });

    it.each([
      ['five digits', (passcode: string) => passcode.slice(1)],
      ['seven digits', (passcode: string) => `${passcode}0`],
      [
        'nonnumeric input',
        (passcode: string) => `${passcode.slice(0, 2)}x${passcode.slice(3)}`,
      ],
    ])(
      'rejects %s at the backend boundary',
      async (_description, makeInvalidPasscode) => {
        const scenario = await createScenario();
        const invitation = await issueInvitation(scenario);

        await expect(
          scenario.service.verifyInvitationPasscode({
            email: 'first@example.com',
            workspaceId: 'workspace-id',
            passcode: makeInvalidPasscode(invitation.passcode),
            ipAddress: '203.0.113.20',
          }),
        ).rejects.toMatchObject({
          code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
        });
      },
    );

    it('fails closed when the invitation membership is suspended before password creation', async () => {
      const scenario = await createScenario();
      const invitation = await issueInvitation(scenario);
      const restricted = await scenario.service.verifyInvitationPasscode({
        email: 'first@example.com',
        workspaceId: 'workspace-id',
        passcode: invitation.passcode,
        ipAddress: '203.0.113.20',
      });

      scenario.setUserWorkspace({ suspendedAt: new Date() });

      await expect(
        scenario.service.hasValidCapability(restricted.capability),
      ).resolves.toBe(false);
      await expect(
        scenario.service.createPermanentPassword(
          restricted.capability,
          permanentPassword,
          permanentPassword,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
    });

    it('creates a normal permanent-password state from invitation capability and increments the epoch', async () => {
      const scenario = await createScenario();
      const invitation = await issueInvitation(scenario);
      const restricted = await scenario.service.verifyInvitationPasscode({
        email: 'first@example.com',
        workspaceId: 'workspace-id',
        passcode: invitation.passcode,
        ipAddress: '203.0.113.20',
      });

      await expect(
        scenario.service.createPermanentPassword(
          restricted.capability,
          permanentPassword,
          permanentPassword,
        ),
      ).resolves.toEqual({ userId: 'user-id', credentialEpoch: 1 });
      expect(scenario.getUser()).toMatchObject({
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        credentialEpoch: 1,
      });
      expect(
        await compareHash(permanentPassword, scenario.getUser().passwordHash!),
      ).toBe(true);
      expect(scenario.getTokens().every((token) => token.revokedAt)).toBe(true);
      expect(scenario.invalidation).toHaveBeenCalledWith('user-id');
    });
  });
});
