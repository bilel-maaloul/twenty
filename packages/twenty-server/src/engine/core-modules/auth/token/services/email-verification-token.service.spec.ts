import crypto from 'crypto';
import { FindOperator } from 'typeorm';

import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';
import { EmailVerificationTokenService } from 'src/engine/core-modules/auth/token/services/email-verification-token.service';

const createService = (overrides?: {
  appTokenRepository?: Record<string, jest.Mock | { transaction: jest.Mock }>;
  userRepository?: Record<string, jest.Mock>;
  twentyConfigService?: Record<string, jest.Mock>;
}) => {
  const transactionAppTokenRepository = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const transactionUserRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'user-id' }),
  };
  const entityManager = {
    getRepository: jest.fn((entity) =>
      entity.name === 'UserEntity'
        ? transactionUserRepository
        : transactionAppTokenRepository,
    ),
  };
  const appTokenRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    manager: {
      transaction: jest.fn(async (callback) => callback(entityManager)),
    },
    ...overrides?.appTokenRepository,
  };
  const userRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides?.userRepository,
  };
  const twentyConfigService = {
    get: jest.fn().mockReturnValue('1h'),
    ...overrides?.twentyConfigService,
  };
  const service = Object.assign(
    Object.create(EmailVerificationTokenService.prototype),
    {
      appTokenRepository,
      userRepository,
      twentyConfigService,
    },
  ) as EmailVerificationTokenService;

  return {
    service,
    appTokenRepository,
    userRepository,
    twentyConfigService,
    entityManager,
    transactionAppTokenRepository,
    transactionUserRepository,
  };
};

describe('EmailVerificationTokenService', () => {
  it('stores only a hash and supersedes prior active tokens under a user lock', async () => {
    const scenario = createService();

    const result = await scenario.service.generateToken(
      'user-id',
      'person@example.com',
    );

    const savedToken = scenario.transactionAppTokenRepository.save.mock
      .calls[0][0] as { value: string; type: AppTokenType };
    const [lockOptions] =
      scenario.transactionUserRepository.findOne.mock.calls[0];

    expect(result.token).toHaveLength(64);
    expect(savedToken.type).toBe(AppTokenType.EmailVerificationToken);
    expect(savedToken.value).toBe(
      crypto.createHash('sha256').update(result.token).digest('hex'),
    );
    expect(savedToken.value).not.toBe(result.token);
    expect(scenario.transactionUserRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(scenario.transactionAppTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        type: AppTokenType.EmailVerificationToken,
        revokedAt: expect.any(FindOperator),
      }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
    expect(lockOptions.where.id).toBe('user-id');
  });

  it('conditionally consumes a hashed token once before returning it to the resolver', async () => {
    const scenario = createService();
    const appToken = {
      id: 'token-id',
      type: AppTokenType.EmailVerificationToken,
      user: { id: 'user-id', mustChangePassword: false },
      context: { email: 'person@example.com' },
      expiresAt: new Date(Date.now() + 60_000),
    };
    scenario.appTokenRepository.findOne.mockResolvedValue(appToken);
    scenario.appTokenRepository.update.mockResolvedValue({ affected: 1 });

    const result = await scenario.service.consumeEmailVerificationTokenOrThrow({
      email: 'person@example.com',
      emailVerificationToken: 'opaque-verification-token',
    });

    expect(result).toBe(appToken);
    expect(scenario.appTokenRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          value: crypto
            .createHash('sha256')
            .update('opaque-verification-token')
            .digest('hex'),
          type: AppTokenType.EmailVerificationToken,
          revokedAt: expect.any(FindOperator),
          deletedAt: expect.any(FindOperator),
        }),
      }),
    );
    expect(scenario.appTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'token-id',
        type: AppTokenType.EmailVerificationToken,
      }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('preserves the explicit expired-token result', async () => {
    const scenario = createService();
    scenario.appTokenRepository.findOne.mockResolvedValue({
      id: 'token-id',
      type: AppTokenType.EmailVerificationToken,
      user: { id: 'user-id', mustChangePassword: false },
      context: { email: 'person@example.com' },
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(
      scenario.service.consumeEmailVerificationTokenOrThrow({
        email: 'person@example.com',
        emailVerificationToken: 'opaque-verification-token',
      }),
    ).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
    expect(scenario.appTokenRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a token that another concurrent verification already consumed', async () => {
    const scenario = createService();
    const appToken = {
      id: 'token-id',
      type: AppTokenType.EmailVerificationToken,
      user: { id: 'user-id', mustChangePassword: false },
      context: { email: 'person@example.com' },
      expiresAt: new Date(Date.now() + 60_000),
    };
    scenario.appTokenRepository.findOne.mockResolvedValue(appToken);
    scenario.appTokenRepository.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    const results = await Promise.allSettled([
      scenario.service.consumeEmailVerificationTokenOrThrow({
        email: 'person@example.com',
        emailVerificationToken: 'opaque-verification-token',
      }),
      scenario.service.consumeEmailVerificationTokenOrThrow({
        email: 'person@example.com',
        emailVerificationToken: 'opaque-verification-token',
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });
});
