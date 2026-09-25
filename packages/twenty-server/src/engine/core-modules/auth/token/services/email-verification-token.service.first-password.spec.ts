import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';
import { EmailVerificationTokenService } from 'src/engine/core-modules/auth/token/services/email-verification-token.service';

describe('EmailVerificationTokenService first-password boundary', () => {
  it('rejects a pending first-password user before verification mutations can consume the token', async () => {
    const appTokenRepository = {
      findOne: jest.fn().mockResolvedValue({
        type: AppTokenType.EmailVerificationToken,
        user: { id: 'user-id', mustChangePassword: true },
        context: { email: 'first@example.com' },
        expiresAt: new Date(Date.now() + 60_000),
      }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = Object.assign(
      Object.create(EmailVerificationTokenService.prototype),
      { appTokenRepository, userRepository },
    ) as EmailVerificationTokenService;

    await expect(
      service.validateEmailVerificationTokenOrThrow({
        email: 'first@example.com',
        emailVerificationToken: 'valid-verification-token',
      }),
    ).rejects.toThrow('First password creation is required');
    expect(appTokenRepository.findOne).toHaveBeenCalledTimes(1);
  });
});
