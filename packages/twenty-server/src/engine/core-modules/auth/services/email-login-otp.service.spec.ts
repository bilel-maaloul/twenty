import { type SendMailOptions } from 'nodemailer';
import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import { AuthException } from 'src/engine/core-modules/auth/auth.exception';
import { compareHash } from 'src/engine/core-modules/auth/auth.util';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { EntityManager, Repository } from 'typeorm';

import { EmailLoginOtpService } from './email-login-otp.service';

jest.mock('twenty-emails', () => ({
  InteractiveLoginOtpEmail: ({ code }: { code: string }) => code,
  renderEmail: jest.fn(async (template: string) => template),
}));

type TestToken = AppTokenEntity & { id: string };

const buildHarness = () => {
  const user = {
    id: 'user-id',
    email: 'person@example.com',
    locale: 'en',
    credentialEpoch: 2,
    passwordHash: 'password-hash',
    permanentPasswordExpiresAt: new Date(Date.now() + 86_400_000),
    disabled: false,
    mustChangePassword: false,
  } as UserEntity;
  const tokens: TestToken[] = [];
  const sentMessages: SendMailOptions[] = [];

  const userRepository = {
    findOneBy: jest.fn().mockResolvedValue(user),
    findOne: jest.fn().mockImplementation(async () => user),
  };
  const appTokenRepository = {
    findOneBy: jest
      .fn()
      .mockImplementation(
        async ({ id, type }) =>
          tokens.find((token) => token.id === id && token.type === type) ??
          null,
      ),
    findOne: jest
      .fn()
      .mockImplementation(
        async ({ where }) =>
          tokens.find(
            (token) =>
              token.id === where.id &&
              token.type === where.type &&
              token.userId === where.userId,
          ) ?? null,
      ),
    create: jest.fn((token) => token),
    save: jest.fn().mockImplementation(async (token) => {
      const savedToken = {
        ...token,
        id: `challenge-${tokens.length + 1}`,
        revokedAt: null,
        deletedAt: null,
      } as TestToken;

      tokens.push(savedToken);

      return savedToken;
    }),
    update: jest.fn().mockImplementation(async (criteria, update) => {
      for (const token of tokens) {
        const matches =
          (criteria.id === undefined || token.id === criteria.id) &&
          (criteria.type === undefined || token.type === criteria.type) &&
          (criteria.userId === undefined || token.userId === criteria.userId) &&
          (criteria.revokedAt === undefined || token.revokedAt === null) &&
          (criteria.deletedAt === undefined || token.deletedAt === null);

        if (matches) {
          Object.assign(token, update);
        }
      }

      return { affected: 1 };
    }),
  };
  const manager = {
    getRepository: jest.fn(
      (entity: typeof UserEntity | typeof AppTokenEntity) =>
        entity === UserEntity ? userRepository : appTokenRepository,
    ),
  };
  const transaction = jest.fn(
    async (callback: (transactionManager: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
  );
  const appTokenRepositoryWithManager = {
    ...appTokenRepository,
    manager: { transaction },
  } as unknown as Repository<AppTokenEntity>;
  const emailSenderService = {
    verifySensitiveDelivery: jest.fn().mockResolvedValue(undefined),
    sendSensitive: jest.fn().mockImplementation(async (message) => {
      sentMessages.push(message);
    }),
  } as unknown as jest.Mocked<EmailSenderService>;
  const config = {
    get: jest.fn((key: string) =>
      key === 'EMAIL_FROM_NAME' ? 'Twenty' : 'no-reply@example.com',
    ),
  } as unknown as TwentyConfigService;
  const cacheStorageService = {
    runScript: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CacheStorageService>;
  const service = new EmailLoginOtpService(
    appTokenRepositoryWithManager,
    userRepository as unknown as Repository<UserEntity>,
    emailSenderService,
    config,
    cacheStorageService,
  );

  return {
    service,
    user,
    tokens,
    sentMessages,
    userRepository,
    appTokenRepository,
    emailSenderService,
    cacheStorageService,
    transaction,
  };
};

const extractCode = (message: SendMailOptions): string => {
  const body = message.text;
  const match = typeof body === 'string' ? body.match(/\b\d{6}\b/) : null;

  if (!match) {
    throw new Error('No one-time code was rendered in the message');
  }

  return match[0];
};

const getWrongCode = (correctCode: string): string =>
  ((Number.parseInt(correctCode, 10) + 1) % 10 ** 6)
    .toString()
    .padStart(6, '0');

describe('EmailLoginOtpService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores only a hash and sends the code through the sensitive SMTP path', async () => {
    const harness = buildHarness();

    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });

    expect(challengeId).toBe(harness.tokens[0].id);
    expect(harness.tokens[0]).toEqual(
      expect.objectContaining({
        type: AppTokenType.EmailLoginOtp,
        userId: harness.user.id,
        workspaceId: null,
        expiresAt: expect.any(Date),
        context: expect.objectContaining({
          credentialEpoch: harness.user.credentialEpoch,
          emailOtpFlow: 'workspace-agnostic',
          authProvider: AuthProviderEnum.Password,
        }),
      }),
    );
    expect(harness.tokens[0].value).not.toBe(
      extractCode(harness.sentMessages[0]),
    );
    expect(
      await compareHash(
        extractCode(harness.sentMessages[0]),
        harness.tokens[0].value,
      ),
    ).toBe(true);
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledWith(
      expect.objectContaining({ to: harness.user.email }),
    );
    expect(harness.transaction).toHaveBeenCalledTimes(1);
  });

  it('consumes a correct code once and rejects replay', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'login-token',
      workspaceId: 'workspace-id',
    });
    const code = extractCode(harness.sentMessages[0]);

    const result = await harness.service.consumeChallenge(challengeId, code);

    expect(result).toEqual({
      user: harness.user,
      authProvider: AuthProviderEnum.Password,
      flow: 'login-token',
      workspaceId: 'workspace-id',
      credentialEpoch: 2,
    });
    expect(harness.tokens[0].revokedAt).toEqual(expect.any(Date));
    await expect(
      harness.service.consumeChallenge(challengeId, code),
    ).rejects.toBeInstanceOf(AuthException);
  });

  it('expires a code after its five-minute lifetime', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });
    const token = harness.tokens.find(({ id }) => id === challengeId);

    if (!token) {
      throw new Error('Issued OTP challenge was not stored');
    }

    token.expiresAt = new Date(Date.now() - 1);

    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);
    expect(token.revokedAt).toBeNull();
  });

  it('does not consume an AppToken whose type is not the email login OTP type', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });
    const token = harness.tokens.find(({ id }) => id === challengeId);

    if (!token) {
      throw new Error('Issued OTP challenge was not stored');
    }

    token.type = AppTokenType.RefreshToken;

    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);
    expect(token.revokedAt).toBeNull();
  });

  it('supersedes the previous challenge when a new login challenge is issued', async () => {
    const harness = buildHarness();
    const previousChallengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });

    const currentChallengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });

    expect(harness.tokens).toHaveLength(2);
    expect(harness.tokens[0].revokedAt).toEqual(expect.any(Date));
    expect(harness.tokens[1].revokedAt).toBeNull();
    await expect(
      harness.service.consumeChallenge(
        previousChallengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);
    await expect(
      harness.service.consumeChallenge(
        currentChallengeId,
        extractCode(harness.sentMessages[1]),
      ),
    ).resolves.toEqual(expect.objectContaining({ flow: 'workspace-agnostic' }));
  });

  it('blocks further OTP verification after the failed-attempt limit', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });
    let failedAttempts = 0;
    harness.cacheStorageService.runScript.mockImplementation(
      async ({ script }) => {
        if (script.name === 'check-interactive-email-otp-attempts') {
          return failedAttempts >= 5 ? 0 : 1;
        }

        if (script.name === 'record-interactive-email-otp-attempt') {
          failedAttempts += 1;

          return failedAttempts;
        }

        return 1;
      },
    );

    await Promise.all(
      Array.from({ length: 5 }, async () =>
        expect(
          harness.service.consumeChallenge(
            challengeId,
            getWrongCode(extractCode(harness.sentMessages[0])),
          ),
        ).rejects.toBeInstanceOf(AuthException),
      ),
    );

    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);
    expect(failedAttempts).toBe(5);
    expect(harness.tokens[0].revokedAt).toBeNull();
  });

  it('rejects a wrong code and atomically records an attempt', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });

    await expect(
      harness.service.consumeChallenge(
        challengeId,
        getWrongCode(extractCode(harness.sentMessages[0])),
      ),
    ).rejects.toBeInstanceOf(AuthException);
    expect(harness.cacheStorageService.runScript).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          name: 'record-interactive-email-otp-attempt',
        }),
        args: ['5', `${15 * 60 * 1000}`],
      }),
    );
    expect(harness.tokens[0].revokedAt).toBeNull();
  });

  it('rejects stale-epoch, disabled, and first-password-required users', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });

    harness.user.credentialEpoch += 1;
    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);

    harness.user.credentialEpoch -= 1;
    harness.user.disabled = true;
    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);

    harness.user.disabled = false;
    harness.user.mustChangePassword = true;
    await expect(
      harness.service.consumeChallenge(
        challengeId,
        extractCode(harness.sentMessages[0]),
      ),
    ).rejects.toBeInstanceOf(AuthException);
  });

  it('rotates the code on resend and does not accept the prior code', async () => {
    const harness = buildHarness();
    const challengeId = await harness.service.issueChallenge({
      userId: harness.user.id,
      authProvider: AuthProviderEnum.Password,
      flow: 'workspace-agnostic',
    });
    const originalCode = extractCode(harness.sentMessages[0]);

    await harness.service.resendChallenge(challengeId);

    const replacementCode = extractCode(harness.sentMessages[1]);

    expect(replacementCode).not.toBe(originalCode);
    expect(harness.tokens).toHaveLength(1);
    expect(await compareHash(originalCode, harness.tokens[0].value)).toBe(
      false,
    );
    await expect(
      harness.service.consumeChallenge(challengeId, originalCode),
    ).rejects.toBeInstanceOf(AuthException);
    await expect(
      harness.service.consumeChallenge(challengeId, replacementCode),
    ).resolves.toEqual(expect.objectContaining({ flow: 'workspace-agnostic' }));
  });

  it('fails closed when SMTP preflight or Redis state is unavailable', async () => {
    const preflightFailure = buildHarness();
    preflightFailure.emailSenderService.verifySensitiveDelivery.mockRejectedValueOnce(
      new Error('private transport details'),
    );

    await expect(
      preflightFailure.service.issueChallenge({
        userId: preflightFailure.user.id,
        authProvider: AuthProviderEnum.Password,
        flow: 'workspace-agnostic',
      }),
    ).rejects.toBeInstanceOf(AuthException);
    expect(preflightFailure.tokens).toHaveLength(0);
    expect(
      preflightFailure.emailSenderService.sendSensitive,
    ).not.toHaveBeenCalled();

    const redisFailure = buildHarness();
    redisFailure.cacheStorageService.runScript.mockRejectedValueOnce(
      new Error('private redis details'),
    );
    await expect(
      redisFailure.service.issueChallenge({
        userId: redisFailure.user.id,
        authProvider: AuthProviderEnum.Password,
        flow: 'workspace-agnostic',
      }),
    ).rejects.toThrow('private redis details');
    expect(redisFailure.tokens).toHaveLength(0);

    const smtpFailure = buildHarness();
    smtpFailure.emailSenderService.sendSensitive.mockRejectedValueOnce(
      new Error('private transport details'),
    );

    await expect(
      smtpFailure.service.issueChallenge({
        userId: smtpFailure.user.id,
        authProvider: AuthProviderEnum.Password,
        flow: 'workspace-agnostic',
      }),
    ).rejects.toBeInstanceOf(AuthException);
    expect(smtpFailure.tokens).toHaveLength(1);
    expect(smtpFailure.tokens[0].revokedAt).toEqual(expect.any(Date));
    expect(smtpFailure.sentMessages).toHaveLength(0);
  });
});
