jest.mock('twenty-emails', () => ({
  SendEmailVerificationLinkEmail: jest.fn(() => null),
  renderEmail: jest.fn().mockResolvedValue('rendered email body'),
}));

import { EmailVerificationService } from 'src/engine/core-modules/email-verification/services/email-verification.service';

const createService = (preflight = jest.fn().mockResolvedValue(undefined)) => {
  const emailSenderService = {
    verifySensitiveDelivery: preflight,
    sendSensitive: jest.fn().mockResolvedValue(undefined),
  };
  const emailVerificationTokenService = {
    generateToken: jest.fn().mockResolvedValue({
      token: 'opaque-verification-token',
      expiresAt: new Date(Date.now() + 60_000),
    }),
  };
  const service = Object.assign(
    Object.create(EmailVerificationService.prototype),
    {
      emailSenderService,
      emailVerificationTokenService,
      twentyConfigService: {
        get: jest.fn((key: string) => {
          if (key === 'IS_EMAIL_VERIFICATION_REQUIRED') return true;
          if (key === 'EMAIL_FROM_NAME') return 'Twenty';
          if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@example.com';

          return undefined;
        }),
      },
      domainsServerConfigService: {
        buildBaseUrl: jest.fn(() => new URL('https://crm.example.test/')),
      },
      i18nService: {
        getI18nInstance: jest.fn(() => ({ _: jest.fn(() => 'Verify email') })),
      },
    },
  ) as EmailVerificationService;

  return {
    service,
    emailSenderService,
    emailVerificationTokenService,
  };
};

describe('EmailVerificationService', () => {
  it('preflights SMTP before creating and sending a verification token', async () => {
    const scenario = createService();

    await scenario.service.sendVerificationEmail({
      userId: 'user-id',
      email: 'person@example.com',
      workspace: undefined,
      locale: 'en',
    });

    expect(
      scenario.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(
      scenario.emailVerificationTokenService.generateToken,
    ).toHaveBeenCalledWith('user-id', 'person@example.com');
    expect(scenario.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(
      scenario.emailSenderService.verifySensitiveDelivery.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      scenario.emailVerificationTokenService.generateToken.mock
        .invocationCallOrder[0],
    );
    expect(
      scenario.emailVerificationTokenService.generateToken.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      scenario.emailSenderService.sendSensitive.mock.invocationCallOrder[0],
    );
  });

  it('does not create a verification token when SMTP preflight fails', async () => {
    const scenario = createService(
      jest.fn().mockRejectedValue(new Error('SMTP unavailable')),
    );

    await expect(
      scenario.service.sendVerificationEmail({
        userId: 'user-id',
        email: 'person@example.com',
        workspace: undefined,
        locale: 'en',
      }),
    ).rejects.toThrow('SMTP unavailable');

    expect(
      scenario.emailVerificationTokenService.generateToken,
    ).not.toHaveBeenCalled();
    expect(scenario.emailSenderService.sendSensitive).not.toHaveBeenCalled();
  });
});
