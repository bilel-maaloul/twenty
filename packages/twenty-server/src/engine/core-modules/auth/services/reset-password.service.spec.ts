jest.mock('twenty-emails', () => ({
  PasswordResetLinkEmail: jest.fn(() => null),
  renderEmail: jest.fn().mockResolvedValue('rendered reset body'),
}));

import crypto from 'crypto';
import { FindOperator } from 'typeorm';

import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { ResetPasswordService } from 'src/engine/core-modules/auth/services/reset-password.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

const createService = (overrides?: {
  appTokenRepository?: Record<string, jest.Mock>;
  userService?: Record<string, jest.Mock>;
  emailSenderService?: Record<string, jest.Mock>;
}) => {
  const appTokenRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    manager: { transaction: jest.fn() },
    ...overrides?.appTokenRepository,
  };
  const userService = {
    findUserByIdOrThrow: jest.fn(),
    findUserByEmail: jest.fn(),
    ...overrides?.userService,
  };
  const emailSenderService = {
    verifySensitiveDelivery: jest.fn().mockResolvedValue(undefined),
    sendSensitive: jest.fn().mockResolvedValue(undefined),
    ...overrides?.emailSenderService,
  };
  const serviceDependencies = {
    twentyConfigService: {
      get: jest.fn((key: string) => {
        if (key === 'EMAIL_FROM_NAME') return 'Twenty';
        if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@example.com';

        return undefined;
      }),
    },
    workspaceDomainsService: {
      buildWorkspaceURL: jest.fn(() => new URL('https://crm.example.test/')),
    },
    i18nService: {
      getI18nInstance: jest.fn(() => ({ _: jest.fn(() => 'Reset password') })),
    },
  };
  const service = Object.assign(Object.create(ResetPasswordService.prototype), {
    ...serviceDependencies,
    appTokenRepository,
    userService,
    emailSenderService,
  }) as ResetPasswordService;

  return {
    service,
    appTokenRepository,
    userService,
    emailSenderService,
  };
};

describe('ResetPasswordService', () => {
  it('consumes a reset token using a hash and a conditional single-use update', async () => {
    const { service, appTokenRepository } = createService();
    appTokenRepository.update.mockResolvedValue({ affected: 1 });

    await service.consumePasswordResetToken({
      resetToken: 'opaque-reset-token',
      userId: 'user-id',
    });

    const [criteria, update] = appTokenRepository.update.mock.calls[0];
    expect(criteria).toMatchObject({
      userId: 'user-id',
      value: crypto
        .createHash('sha256')
        .update('opaque-reset-token')
        .digest('hex'),
      type: AppTokenType.PasswordResetToken,
      revokedAt: expect.any(FindOperator),
      deletedAt: expect.any(FindOperator),
      expiresAt: expect.any(FindOperator),
    });
    expect(criteria.value).not.toBe('opaque-reset-token');
    expect(criteria.revokedAt.type).toBe('isNull');
    expect(criteria.deletedAt.type).toBe('isNull');
    expect(criteria.expiresAt.type).toBe('moreThan');
    expect(update.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects an already-consumed or expired reset token', async () => {
    const { service, appTokenRepository } = createService();
    appTokenRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.consumePasswordResetToken({
        resetToken: 'opaque-reset-token',
        userId: 'user-id',
      }),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    } satisfies Partial<AuthException>);
  });

  it('does not validate a revoked reset token', async () => {
    const { service, appTokenRepository } = createService();
    appTokenRepository.findOne.mockResolvedValue(null);

    await expect(
      service.validatePasswordResetToken('opaque-reset-token'),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });

    const [query] = appTokenRepository.findOne.mock.calls[0];
    expect(query.where.type).toBe(AppTokenType.PasswordResetToken);
    expect(query.where.value).not.toBe('opaque-reset-token');
    expect(query.where.revokedAt.type).toBe('isNull');
    expect(query.where.deletedAt.type).toBe('isNull');
    expect(query.where.expiresAt.type).toBe('moreThan');
  });

  it('preflights SMTP before rotating the active token', async () => {
    const { service, emailSenderService } = createService();
    const generatedToken = {
      status: 'TOKEN_GENERATED',
      resetToken: {
        workspaceId: 'workspace-id',
        passwordResetToken: 'opaque-reset-token',
        passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
      },
      user: { id: 'user-id' },
      workspace: { id: 'workspace-id' },
    };
    const generation = jest
      .spyOn(service, 'generatePasswordResetToken')
      .mockResolvedValue(generatedToken as never);
    const rotation = jest
      .spyOn(service, 'rotatePasswordResetToken')
      .mockResolvedValue(undefined);
    const send = jest
      .spyOn(service, 'sendEmailPasswordResetLink')
      .mockResolvedValue({ success: true });

    await service.generateAndSendPasswordResetLink({
      email: 'person@example.com',
      locale: 'en',
    });

    expect(generation).toHaveBeenCalledTimes(1);
    expect(emailSenderService.verifySensitiveDelivery).toHaveBeenCalledTimes(1);
    expect(rotation).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      emailSenderService.verifySensitiveDelivery.mock.invocationCallOrder[0],
    ).toBeLessThan(rotation.mock.invocationCallOrder[0]);
  });

  it('sends reset links through the sensitive SMTP path', async () => {
    const { service, emailSenderService } = createService();

    await service.sendEmailPasswordResetLink({
      resetToken: {
        workspaceId: 'workspace-id',
        passwordResetToken: 'opaque-reset-token',
        passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
      },
      user: {
        email: 'person@example.com',
        passwordHash: 'already-hashed',
      } as UserEntity,
      workspace: { id: 'workspace-id' } as WorkspaceEntity,
      locale: 'en',
    });

    expect(emailSenderService.sendSensitive).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'person@example.com',
        subject: 'Reset password',
        text: 'rendered reset body',
        html: 'rendered reset body',
      }),
    );
  });
});
