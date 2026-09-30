import { createHash } from 'crypto';

import { type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthResolver } from 'src/engine/core-modules/auth/auth.resolver';
import { CaptchaExceptionCode } from 'src/engine/core-modules/captcha/captcha.exception';

import { CaptchaGuard } from './captcha.guard';

describe('CaptchaGuard on protected authentication operations', () => {
  const captchaService = { validate: jest.fn() };
  const metricsService = { incrementCounterForEvent: jest.fn() };
  const guard = new CaptchaGuard(
    captchaService as never,
    metricsService as never,
  );

  const contextWithToken = (captchaToken?: string) =>
    ({
      getType: () => 'graphql',
      getClass: () => AuthResolver,
      getHandler: () => AuthResolver.prototype.signIn,
      getArgs: () => [{}, { captchaToken }, {}, {}],
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    'checkUserExists',
    'signIn',
    'getLoginTokenFromCredentials',
    'getAuthTokensFromOTP',
    'signUp',
    'signUpInWorkspace',
    'emailPasswordResetLink',
  ])('keeps the server CAPTCHA guard on %s', (operation) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthResolver.prototype[operation as keyof AuthResolver],
    ) as unknown[];

    expect(guards).toContain(CaptchaGuard);
  });

  it('requires CAPTCHA for first-password creation but not invitation-code verification', () => {
    const createPasswordGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthResolver.prototype.createFirstPassword,
    ) as unknown[];
    const verifyInvitationCodeGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthResolver.prototype.verifyFirstPasswordInvitationPasscode,
    ) as unknown[];

    expect(createPasswordGuards).toContain(CaptchaGuard);
    expect(verifyInvitationCodeGuards).not.toContain(CaptchaGuard);
  });

  it('accepts a valid CAPTCHA after server validation', async () => {
    captchaService.validate.mockResolvedValueOnce({ success: true });

    await expect(guard.canActivate(contextWithToken('valid'))).resolves.toBe(
      true,
    );
    expect(captchaService.validate).toHaveBeenCalledWith('valid');
  });

  it.each([undefined, 'response-token-secret'])(
    'rejects a missing or invalid CAPTCHA when validation fails: %s',
    async (captchaToken) => {
      captchaService.validate.mockResolvedValueOnce({ success: false });

      await expect(
        guard.canActivate(contextWithToken(captchaToken)),
      ).rejects.toMatchObject({ code: CaptchaExceptionCode.INVALID_CAPTCHA });
      expect(captchaService.validate).toHaveBeenCalledWith(captchaToken ?? '');

      if (captchaToken) {
        const metricEvent =
          metricsService.incrementCounterForEvent.mock.calls[0][0];

        expect(metricsService.incrementCounterForEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: createHash('sha256').update(captchaToken).digest('hex'),
          }),
        );
        expect(JSON.stringify(metricEvent)).not.toContain(captchaToken);
      }
    },
  );
});
