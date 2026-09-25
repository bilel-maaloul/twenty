import { randomBytes } from 'node:crypto';

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
import {
  FirstPasswordCreationService,
  FirstPasswordInputRejectedException,
} from 'src/engine/core-modules/auth/services/first-password-creation.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

type StoredToken = Pick<
  AppTokenEntity,
  | 'id'
  | 'userId'
  | 'type'
  | 'value'
  | 'expiresAt'
  | 'revokedAt'
  | 'deletedAt'
  | 'context'
>;

describe('FirstPasswordCreationService', () => {
  const temporaryPassword = 'temporary-password-123';
  const permanentPassword = 'permanent-password-123';

  const createScenario = async () => {
    let user: {
      id: string;
      email: string;
      passwordHash: string;
      disabled: boolean;
      mustChangePassword: boolean;
      temporaryPasswordExpiresAt: Date | null;
      credentialEpoch: number;
    } = {
      id: 'user-id',
      email: 'first@example.com',
      passwordHash: await hashPassword(temporaryPassword),
      disabled: false,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      credentialEpoch: 0,
    };
    let tokens: StoredToken[] = [];
    let nextId = 0;
    let transactionQueue = Promise.resolve();
    const invalidation = jest.fn().mockResolvedValue(undefined);
    const userRepository = {
      findOne: jest.fn(async () => ({ ...user })),
      findOneBy: jest.fn(async () => ({ ...user })),
      update: jest.fn(
        async (
          where: { credentialEpoch: number },
          values: {
            passwordHash: string;
            mustChangePassword: boolean;
            temporaryPasswordExpiresAt: null;
          },
        ) => {
          if (
            user.credentialEpoch !== where.credentialEpoch ||
            !user.mustChangePassword ||
            user.disabled
          ) {
            return { affected: 0 };
          }

          user = {
            ...user,
            ...values,
            credentialEpoch: user.credentialEpoch + 1,
          };

          return { affected: 1 };
        },
      ),
    };
    const appTokenRepository = {
      findOne: jest.fn(
        async ({
          where,
        }: {
          where: { id?: string; value?: string; type?: AppTokenType };
        }) =>
          tokens.find(
            (token) =>
              (where.id === undefined || token.id === where.id) &&
              (where.value === undefined || token.value === where.value) &&
              (where.type === undefined || token.type === where.type),
          ) ?? null,
      ),
      findOneBy: jest.fn(
        async ({ id }: { id: string }) =>
          tokens.find((token) => token.id === id) ?? null,
      ),
      update: jest.fn(
        async (
          { userId, type }: { userId: string; type: AppTokenType },
          values: { revokedAt: Date },
        ) => {
          tokens = tokens.map((token) =>
            token.userId === userId && token.type === type && !token.revokedAt
              ? { ...token, revokedAt: values.revokedAt }
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
    const manager = {
      getRepository: jest.fn(
        (entity: typeof UserEntity | typeof AppTokenEntity) =>
          entity === UserEntity ? userRepository : appTokenRepository,
      ),
    };
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
        appTokenRepository: { ...appTokenRepository, manager: { transaction } },
        userRepository,
        twentyConfigService: {
          get: () => '5m',
        },
        authService: {
          invalidateCredentialsAfterPasswordChange: invalidation,
        } as Pick<AuthService, 'invalidateCredentialsAfterPasswordChange'>,
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
      getTokens: () => tokens,
      transaction,
      manager,
      userRepository,
      appTokenRepository,
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
    ).resolves.toBeUndefined();
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
      }),
    );
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
      ).resolves.toBeUndefined();
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
        randomBytes(32).toString('base64url'),
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
        randomBytes(32).toString('base64url'),
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
    ).resolves.toBeUndefined();
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
    ).resolves.toBeUndefined();
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
});
