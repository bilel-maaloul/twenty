import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';
import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { hashPassword } from 'src/engine/core-modules/auth/auth.util';
import { UserSessionRevokedReason } from 'src/engine/core-modules/user-session/types/user-session-revoked-reason.type';

import { AuthService } from './auth.service';

jest.mock('twenty-emails', () => ({
  PasswordUpdateNotifyEmail: jest.fn(() => ({})),
  renderEmail: jest.fn(async () => ''),
}));

describe('AuthService.updatePassword credential invalidation', () => {
  it('increments the user epoch and attempts every credential revocation even if cache invalidation fails', async () => {
    const calls: string[] = [];
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-id',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        userWorkspaces: [{ locale: 'en' }],
      }),
      update: jest.fn(
        async (_userId: string, _values: { credentialEpoch: () => string }) => {
          calls.push('update');
        },
      ),
    };
    const coreEntityCacheService = {
      invalidate: jest.fn(async () => {
        calls.push('invalidate');
      }),
    };
    const appTokenRepository = {
      update: jest.fn(async () => {
        calls.push('revoke-refresh');
      }),
    };
    const userSessionService = {
      revokeAllSessionsForUser: jest.fn(async () => {
        calls.push('revoke-sessions');
      }),
    };
    const logger = { error: jest.fn() };
    const emailService = { send: jest.fn() };
    const service = Object.assign(Object.create(AuthService.prototype), {
      userRepository,
      coreEntityCacheService,
      appTokenRepository,
      userSessionService,
      logger,
      domainServerConfigService: {
        getBaseUrl: () => new URL('http://localhost'),
      },
      i18nService: { getI18nInstance: () => ({ _: () => 'Password updated' }) },
      twentyConfigService: { get: () => 'sender@example.com' },
      emailService,
    }) as AuthService;

    await expect(
      service.updatePassword('user-id', 'new-password-123'),
    ).resolves.toEqual({
      success: true,
    });

    expect(userRepository.update).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        passwordHash: expect.any(String),
        credentialEpoch: expect.any(Function),
      }),
    );
    expect(userRepository.update.mock.calls[0][1].credentialEpoch()).toBe(
      '"credentialEpoch" + 1',
    );
    expect(coreEntityCacheService.invalidate).toHaveBeenCalledWith(
      'user',
      'user-id',
    );
    expect(appTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ type: AppTokenType.RefreshToken }),
      expect.any(Object),
    );
    expect(userSessionService.revokeAllSessionsForUser).toHaveBeenCalledWith({
      userId: 'user-id',
      reason: UserSessionRevokedReason.PasswordChanged,
    });
    expect(calls).toEqual([
      'update',
      'invalidate',
      'revoke-refresh',
      'revoke-sessions',
    ]);

    coreEntityCacheService.invalidate.mockImplementationOnce(() => {
      calls.push('invalidate');
      throw new Error('cache invalidation failed');
    });

    await expect(
      service.updatePassword('user-id', 'another-password-123'),
    ).resolves.toEqual({ success: true });
    expect(calls.slice(4)).toEqual([
      'update',
      'invalidate',
      'revoke-refresh',
      'revoke-sessions',
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      'Password changed for user user-id, but user cache invalidation failed.',
    );

    emailService.send.mockRejectedValueOnce(new Error('email unavailable'));

    await expect(
      service.updatePassword('user-id', 'third-password-123'),
    ).resolves.toEqual({ success: true });
    expect(logger.error).toHaveBeenLastCalledWith(
      'Password changed for user user-id, but the notification email failed.',
    );
  });
});

describe('AuthService.validateLoginWithPassword first-login boundary', () => {
  const password = 'temporary-password-123';

  const createScenario = async () => {
    const user = {
      id: 'first-user',
      email: 'first@example.com',
      passwordHash: await hashPassword(password),
      disabled: false,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      credentialEpoch: 0,
      isEmailVerified: false,
      userWorkspaces: [],
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
    };
    const service = Object.assign(Object.create(AuthService.prototype), {
      userRepository,
      twentyConfigService: {
        get: (key: string) =>
          key === 'IS_EMAIL_VERIFICATION_REQUIRED' ? true : undefined,
      },
    }) as AuthService;

    return { service, user, userRepository };
  };

  it('allows a valid unverified temporary user only into the restricted branch', async () => {
    const { service } = await createScenario();

    await expect(
      service.validateLoginWithPassword({
        email: 'first@example.com',
        password,
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({ kind: 'firstPasswordCreation' }),
    );
  });

  it.each([
    ['missing', null],
    ['equal to now', new Date('2026-09-24T12:00:00.000Z')],
    ['expired', new Date('2026-09-24T11:59:59.000Z')],
  ])('rejects %s temporary-password expiry', async (_name, expiry) => {
    const { service, user } = await createScenario();
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-09-24T12:00:00.000Z').getTime());

    user.temporaryPasswordExpiresAt = expiry as Date;

    try {
      await expect(
        service.validateLoginWithPassword({
          email: user.email,
          password,
        } as never),
      ).rejects.toThrow();
    } finally {
      now.mockRestore();
    }
  });

  it('rejects disabled and wrong-password temporary users', async () => {
    const { service, user } = await createScenario();

    user.disabled = true;
    await expect(
      service.validateLoginWithPassword({
        email: user.email,
        password,
      } as never),
    ).rejects.toThrow();
    user.disabled = false;
    await expect(
      service.validateLoginWithPassword({
        email: user.email,
        password: 'wrong',
      } as never),
    ).rejects.toThrow();
  });

  it('preserves normal-user email-verification behavior', async () => {
    const { service, user } = await createScenario();

    user.mustChangePassword = false;
    await expect(
      service.validateLoginWithPassword({
        email: user.email,
        password,
      } as never),
    ).rejects.toThrow();
    user.isEmailVerified = true;
    await expect(
      service.validateLoginWithPassword({
        email: user.email,
        password,
      } as never),
    ).resolves.toEqual(expect.objectContaining({ kind: 'normal' }));
  });
});

describe('AuthService.validateLoginWithPassword enumeration resistance', () => {
  const password = 'valid-password-123';

  const createService = (
    user: Record<string, unknown> | null,
    checkAccessAndUseInvitationOrThrow = jest.fn(),
  ) => {
    const service = Object.assign(Object.create(AuthService.prototype), {
      userRepository: {
        findOne: jest.fn().mockResolvedValue(user),
      },
      twentyConfigService: { get: () => false },
      checkAccessAndUseInvitationOrThrow,
    }) as AuthService;

    return { service, checkAccessAndUseInvitationOrThrow };
  };

  it('returns the same outward credential failure for an unknown email and a wrong password', async () => {
    const existingUser = {
      id: 'existing-user',
      email: 'existing@example.com',
      passwordHash: await hashPassword(password),
      disabled: false,
      mustChangePassword: false,
      isEmailVerified: true,
      userWorkspaces: [],
    };

    const { service: unknownEmailService } = createService(null);
    const { service: wrongPasswordService } = createService(existingUser);

    const unknownEmailFailure = unknownEmailService
      .validateLoginWithPassword({
        email: 'missing@example.com',
        password,
      } as never)
      .catch((error: { code: string; message: string }) => ({
        code: error.code,
        message: error.message,
      }));
    const wrongPasswordFailure = wrongPasswordService
      .validateLoginWithPassword({
        email: existingUser.email,
        password: 'incorrect-password',
      } as never)
      .catch((error: { code: string; message: string }) => ({
        code: error.code,
        message: error.message,
      }));

    await expect(unknownEmailFailure).resolves.toEqual({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
      message: 'Invalid email or password',
    });
    await expect(wrongPasswordFailure).resolves.toEqual({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
      message: 'Invalid email or password',
    });
  });

  it('checks workspace membership only after the password is validated', async () => {
    const existingUser = {
      id: 'existing-user',
      email: 'existing@example.com',
      passwordHash: await hashPassword(password),
      disabled: false,
      mustChangePassword: false,
      isEmailVerified: true,
      userWorkspaces: [],
    };
    const membershipFailure = new Error(
      'User is not a member of the workspace',
    );
    const checkAccessAndUseInvitationOrThrow = jest
      .fn()
      .mockRejectedValue(membershipFailure);
    const { service } = createService(
      existingUser,
      checkAccessAndUseInvitationOrThrow,
    );
    const targetWorkspace = {
      isPasswordAuthEnabled: true,
    } as never;

    await expect(
      service.validateLoginWithPassword(
        {
          email: existingUser.email,
          password: 'incorrect-password',
        } as never,
        targetWorkspace,
      ),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
      message: 'Invalid email or password',
    });
    expect(checkAccessAndUseInvitationOrThrow).not.toHaveBeenCalled();

    await expect(
      service.validateLoginWithPassword(
        { email: existingUser.email, password } as never,
        targetWorkspace,
      ),
    ).rejects.toBe(membershipFailure);
    expect(checkAccessAndUseInvitationOrThrow).toHaveBeenCalledTimes(1);
  });
});
