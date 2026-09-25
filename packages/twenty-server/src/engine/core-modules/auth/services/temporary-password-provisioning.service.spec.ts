import { Logger } from '@nestjs/common';

import { QueryFailedError, Repository } from 'typeorm';

import { compareHash } from 'src/engine/core-modules/auth/auth.util';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { TemporaryPasswordProvisioningService } from 'src/engine/core-modules/auth/services/temporary-password-provisioning.service';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

jest.mock('twenty-emails', () => ({
  AdministratorTemporaryPasswordEmail: jest.fn((props) => props),
  renderEmail: jest.fn(
    async (props) => `rendered-body:${props.temporaryPassword}`,
  ),
}));

const WORKSPACE = { id: 'workspace-id' } as WorkspaceEntity;
const createEmailUniqueViolation = () =>
  new QueryFailedError('INSERT INTO "core"."user"', [], {
    code: '23505',
    constraint: 'UQ_USER_EMAIL',
  } as Error & { code: string; constraint: string });

const createUser = (overrides: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'user-id',
    email: 'person@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    locale: 'en',
    disabled: false,
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    credentialEpoch: 0,
    passwordHash: null,
    deletedAt: null,
    ...overrides,
  }) as UserEntity;

const createHarness = () => {
  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn((values) => values),
    save: jest.fn(),
    update: jest.fn(),
  };
  const userWorkspaceService = {
    ensureUserIsInWorkspace: jest.fn().mockResolvedValue(undefined),
  };
  const emailSenderService = {
    verifySensitiveDelivery: jest.fn().mockResolvedValue(undefined),
    sendSensitive: jest.fn().mockResolvedValue(undefined),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'TEMPORARY_PASSWORD_EXPIRES_IN') return '24h';
      if (key === 'EMAIL_FROM_NAME') return 'Twenty';
      if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@example.com';

      throw new Error(`Unexpected config key ${key}`);
    }),
  };
  const authService = {
    invalidateCredentialsAfterPasswordChange: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const loggerError = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation();
  const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const service = new TemporaryPasswordProvisioningService(
    userRepository as unknown as Repository<UserEntity>,
    userWorkspaceService as unknown as UserWorkspaceService,
    emailSenderService as unknown as EmailSenderService,
    twentyConfigService as unknown as TwentyConfigService,
    authService as unknown as AuthService,
  );

  return {
    service,
    userRepository,
    userWorkspaceService,
    emailSenderService,
    authService,
    loggerError,
    loggerWarn,
  };
};

const getEmailPassword = (sendOptions: { text: string }): string => {
  const match = sendOptions.text.match(/^rendered-body:(.+)$/);

  if (!match) {
    throw new Error('Temporary password missing from sensitive email body');
  }

  return match[1];
};

describe('TemporaryPasswordProvisioningService', () => {
  beforeAll(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const params = {
    email: '  PERSON@example.com ',
    firstName: 'Jane',
    lastName: 'Doe',
    workspace: WORKSPACE,
  };

  it('creates a locked user with a bcrypt hash and sends the plaintext only through sensitive SMTP', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.userRepository.save.mockImplementation(async (user) =>
      Object.assign({}, savedUser, user),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    const savedValues = harness.userRepository.save.mock.calls[0][0];
    const passwordFromEmail = getEmailPassword(
      harness.emailSenderService.sendSensitive.mock.calls[0][0],
    );

    expect(result).toEqual({
      userId: 'user-id',
      userWasCreated: true,
      temporaryPasswordEmail: 'sent',
      workspaceMembership: 'complete',
    });
    expect(savedValues.email).toBe('person@example.com');
    expect(savedValues.passwordHash).not.toBe(passwordFromEmail);
    expect(await compareHash(passwordFromEmail, savedValues.passwordHash)).toBe(
      true,
    );
    expect(savedValues).toMatchObject({
      mustChangePassword: true,
      credentialEpoch: 0,
      disabled: false,
      canAccessFullAdminPanel: false,
      canImpersonate: false,
    });
    expect(savedValues.temporaryPasswordExpiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1000,
    );
    expect(savedValues.temporaryPasswordExpiresAt.getTime()).toBeLessThan(
      Date.now() + 25 * 60 * 60 * 1000,
    );
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      passwordFromEmail,
    );
    expect(harness.loggerWarn.mock.calls.flat().join(' ')).not.toContain(
      passwordFromEmail,
    );
  });

  it('adds an existing active user to the workspace without changing credentials or sending email', async () => {
    const harness = createHarness();
    const existingUser = createUser({
      mustChangePassword: false,
      credentialEpoch: 4,
      passwordHash: 'existing-password-hash',
    });

    harness.userRepository.findOne.mockResolvedValueOnce(existingUser);

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: existingUser.id,
      userWasCreated: false,
      temporaryPasswordEmail: 'not_sent_existing_user',
      workspaceMembership: 'complete',
    });
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledWith(existingUser, WORKSPACE, undefined);
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
  });

  it('fails safely for a matching soft-deleted identity', async () => {
    const harness = createHarness();

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createUser({ deletedAt: new Date() }));

    await expect(
      harness.service.provisionUserWithTemporaryPassword(params),
    ).rejects.toThrow('Unable to provision the user');

    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).not.toHaveBeenCalled();
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.loggerWarn.mock.calls.flat().join(' ')).not.toContain(
      'person@example.com',
    );
  });

  it('fails SMTP preflight before creating any credential state', async () => {
    const harness = createHarness();

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.emailSenderService.verifySensitiveDelivery.mockRejectedValueOnce(
      new Error('smtp-secret-password'),
    );

    await expect(
      harness.service.provisionUserWithTemporaryPassword(params),
    ).rejects.toThrow('Sensitive email SMTP preflight failed');

    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'smtp-secret-password',
    );
  });

  it('treats a concurrent active-user winner as existing and never rotates or emails it', async () => {
    const harness = createHarness();
    const winningUser = createUser({
      id: 'winning-user-id',
      passwordHash: 'winner-hash',
      credentialEpoch: 3,
    });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winningUser);
    harness.userRepository.save.mockRejectedValueOnce(
      createEmailUniqueViolation(),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: winningUser.id,
      userWasCreated: false,
      temporaryPasswordEmail: 'not_sent_existing_user',
      workspaceMembership: 'complete',
    });
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledWith(winningUser, WORKSPACE, undefined);
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
  });

  it('rejects a disabled existing identity without reconciling membership or changing credentials', async () => {
    const harness = createHarness();
    const disabledUser = createUser({
      disabled: true,
      passwordHash: 'existing-hash',
      credentialEpoch: 4,
    });

    harness.userRepository.findOne.mockResolvedValueOnce(disabledUser);

    await expect(
      harness.service.provisionUserWithTemporaryPassword(params),
    ).rejects.toThrow('Unable to provision the user');

    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).not.toHaveBeenCalled();
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(disabledUser).toMatchObject({
      disabled: true,
      passwordHash: 'existing-hash',
      credentialEpoch: 4,
    });
  });

  it.each([
    [
      'ambiguous database outcome',
      new Error('connection dropped after commit'),
    ],
    [
      'an unrelated unique constraint violation',
      new QueryFailedError('INSERT INTO "core"."user"', [], {
        code: '23505',
        constraint: 'some_other_unique_constraint',
      } as Error & { code: string; constraint: string }),
    ],
  ])(
    'requires review after %s instead of treating it as a winning user',
    async (_name, error) => {
      const harness = createHarness();
      harness.userRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      harness.userRepository.save.mockRejectedValueOnce(error);

      await expect(
        harness.service.provisionUserWithTemporaryPassword(params),
      ).rejects.toMatchObject({ failure: 'review_required' });

      expect(harness.userRepository.findOne).toHaveBeenCalledTimes(2);
      expect(
        harness.userWorkspaceService.ensureUserIsInWorkspace,
      ).not.toHaveBeenCalled();
      expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
      expect(harness.userRepository.update).not.toHaveBeenCalled();
    },
  );

  it('converges concurrent provisioning requests on the database uniqueness winner', async () => {
    const harness = createHarness();
    let persistedUser: UserEntity | null = null;
    let saveCalls = 0;
    let releaseSaves: (() => void) | undefined;
    const saveBarrier = new Promise<void>((resolve) => {
      releaseSaves = resolve;
    });

    harness.userRepository.findOne.mockImplementation(
      async () => persistedUser,
    );
    harness.userRepository.save.mockImplementation(async (values) => {
      saveCalls += 1;

      if (saveCalls === 2) {
        releaseSaves?.();
      }

      await saveBarrier;

      if (persistedUser) {
        throw createEmailUniqueViolation();
      }

      persistedUser = Object.assign(
        {},
        createUser({ id: 'database-winner' }),
        values,
      ) as UserEntity;

      return persistedUser;
    });

    const results = await Promise.all([
      harness.service.provisionUserWithTemporaryPassword(params),
      harness.service.provisionUserWithTemporaryPassword(params),
    ]);

    expect(saveCalls).toBe(2);
    expect(
      results
        .map(({ userWasCreated }) => userWasCreated)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual([false, true]);
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(2);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledTimes(2);
  });

  it('repairs partial membership state on retry without creating or mailing another credential', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(savedUser);
    harness.userRepository.save.mockResolvedValueOnce(savedUser);
    harness.userWorkspaceService.ensureUserIsInWorkspace
      .mockRejectedValueOnce(new Error('workspace relationship failure'))
      .mockResolvedValueOnce(undefined);

    const firstResult =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(firstResult).toMatchObject({
      userWasCreated: true,
      temporaryPasswordEmail: 'sent',
      workspaceMembership: 'incomplete',
    });

    const retryResult =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(retryResult).toMatchObject({
      userWasCreated: false,
      temporaryPasswordEmail: 'not_sent_existing_user',
      workspaceMembership: 'complete',
    });
    expect(harness.userRepository.save).toHaveBeenCalledTimes(1);
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledTimes(2);
  });

  it('returns an ambiguous email status without leaking SMTP error or password', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.userRepository.save.mockResolvedValueOnce(savedUser);
    harness.emailSenderService.sendSensitive.mockImplementationOnce(
      async (options) => {
        const password = getEmailPassword(options);

        throw new Error(`SMTP failed after acceptance: ${password}`);
      },
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);
    const secret = getEmailPassword(
      harness.emailSenderService.sendSensitive.mock.calls[0][0],
    );

    expect(result.temporaryPasswordEmail).toBe('failed_or_unknown');
    expect(result.workspaceMembership).toBe('complete');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      secret,
    );
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'SMTP failed after acceptance',
    );
  });

  it('atomically rotates a temporary credential, increments the epoch and invalidates Phase 1 state', async () => {
    const harness = createHarness();
    const user = createUser({
      mustChangePassword: true,
      credentialEpoch: 2,
      passwordHash: 'old-hash',
    });

    harness.userRepository.findOne.mockResolvedValueOnce(user);
    harness.userRepository.update.mockResolvedValueOnce({ affected: 1 });

    const result = await harness.service.rotateTemporaryPassword(user.id);
    const updateCall = harness.userRepository.update.mock.calls[0];
    const secret = getEmailPassword(
      harness.emailSenderService.sendSensitive.mock.calls[0][0],
    );

    expect(result).toEqual({
      userId: user.id,
      credentialEpoch: 3,
      temporaryPasswordEmail: 'sent',
    });
    expect(updateCall[0]).toEqual({
      id: user.id,
      credentialEpoch: 2,
      mustChangePassword: true,
      disabled: false,
    });
    expect(updateCall[1]).toMatchObject({
      mustChangePassword: true,
      credentialEpoch: expect.any(Function),
    });
    expect(updateCall[1].credentialEpoch()).toBe('"credentialEpoch" + 1');
    expect(updateCall[1].passwordHash).not.toBe(secret);
    expect(await compareHash(secret, updateCall[1].passwordHash)).toBe(true);
    expect(
      await compareHash(
        'previous-temporary-password',
        updateCall[1].passwordHash,
      ),
    ).toBe(false);
    expect(
      harness.authService.invalidateCredentialsAfterPasswordChange,
    ).toHaveBeenCalledWith(user.id);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      secret,
    );
  });

  it('reports an unknown database rotation outcome only when authoritative state cannot be established', async () => {
    const harness = createHarness();
    const user = createUser({ mustChangePassword: true, credentialEpoch: 0 });

    harness.userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce(new Error('database unavailable'));
    harness.userRepository.update.mockRejectedValueOnce(
      new Error('connection dropped after commit'),
    );

    await expect(
      harness.service.rotateTemporaryPassword(user.id),
    ).rejects.toThrow('Temporary-password rotation outcome is unknown');

    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(
      harness.authService.invalidateCredentialsAfterPasswordChange,
    ).not.toHaveBeenCalled();
  });

  it('confirms a committed rotation after an ambiguous database error before reporting success', async () => {
    const harness = createHarness();
    const user = createUser({ mustChangePassword: true, credentialEpoch: 0 });
    let committedUser: UserEntity | null = null;

    harness.userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockImplementationOnce(async () => committedUser);
    harness.userRepository.update.mockImplementationOnce(
      async (_criteria, values) => {
        committedUser = Object.assign({}, user, values, {
          credentialEpoch: 1,
        }) as UserEntity;

        throw new Error('connection dropped after commit');
      },
    );

    const result = await harness.service.rotateTemporaryPassword(user.id);

    expect(result).toEqual({
      userId: user.id,
      credentialEpoch: 1,
      temporaryPasswordEmail: 'sent',
    });
    expect(
      harness.authService.invalidateCredentialsAfterPasswordChange,
    ).toHaveBeenCalledWith(user.id);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
  });

  it('does not mutate a temporary credential when rotation preflight fails', async () => {
    const harness = createHarness();
    const user = createUser({ mustChangePassword: true });

    harness.userRepository.findOne.mockResolvedValueOnce(user);
    harness.emailSenderService.verifySensitiveDelivery.mockRejectedValueOnce(
      new Error('SMTP unavailable'),
    );

    await expect(
      harness.service.rotateTemporaryPassword(user.id),
    ).rejects.toThrow('Sensitive email SMTP preflight failed');

    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(
      harness.authService.invalidateCredentialsAfterPasswordChange,
    ).not.toHaveBeenCalled();
  });

  it('allows only one concurrent resend to rotate, invalidate and email a credential', async () => {
    const harness = createHarness();
    const user = createUser({
      mustChangePassword: true,
      credentialEpoch: 7,
      passwordHash: 'old-temporary-password-hash',
    });
    let updatesStarted = 0;
    let releaseUpdates: (() => void) | undefined;
    const updatesBarrier = new Promise<void>((resolve) => {
      releaseUpdates = resolve;
    });

    harness.userRepository.findOne.mockResolvedValue(user);
    harness.userRepository.update.mockImplementation(async () => {
      const updateNumber = ++updatesStarted;
      if (updatesStarted === 2) {
        releaseUpdates?.();
      }
      await updatesBarrier;

      return { affected: updateNumber === 1 ? 1 : 0 };
    });

    const results = await Promise.allSettled([
      harness.service.rotateTemporaryPassword(user.id),
      harness.service.rotateTemporaryPassword(user.id),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(harness.userRepository.update).toHaveBeenCalledTimes(2);
    expect(
      harness.authService.invalidateCredentialsAfterPasswordChange,
    ).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'previous-temporary-password',
    );
  });
});
