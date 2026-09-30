import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { SignInUpService } from './sign-in-up.service';

describe('password signup expiry', () => {
  it('starts a permanent password lifetime when computing a new password user', async () => {
    const service = Object.create(SignInUpService.prototype) as SignInUpService;
    const createdAt = new Date();

    jest.useFakeTimers().setSystemTime(createdAt);

    try {
      const user = await service.computePartialUserFromUserPayload(
        {
          email: 'new-user@example.com',
        } as never,
        {
          provider: AuthProviderEnum.Password,
          password: 'Strong-password-123',
        } as never,
      );

      expect(user.permanentPasswordExpiresAt?.getTime()).toBe(
        createdAt.getTime() + 90 * 24 * 60 * 60 * 1000,
      );
      expect(user.passwordHash).toEqual(expect.any(String));
    } finally {
      jest.useRealTimers();
    }
  });
});
