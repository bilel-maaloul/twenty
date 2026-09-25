import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';

import {
  assertUserCanAuthenticate,
  assertUserCredentialIsValid,
} from './assert-user-credential-is-valid.util';

describe('user credential validation', () => {
  const enabledUser = {
    disabled: false,
    mustChangePassword: false,
    credentialEpoch: 0,
  };

  it('accepts an existing user and a legacy credential at epoch zero', () => {
    expect(() => assertUserCanAuthenticate(enabledUser)).not.toThrow();
    expect(() => assertUserCredentialIsValid(enabledUser)).not.toThrow();
  });

  it('rejects disabled users and users required to change their password', () => {
    for (const user of [
      { ...enabledUser, disabled: true },
      { ...enabledUser, mustChangePassword: true },
    ]) {
      expect(() => assertUserCanAuthenticate(user)).toThrow(
        expect.objectContaining({
          code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
        }),
      );
    }
  });

  it('rejects missing, old, malformed, or future epochs after rotation', () => {
    const rotatedUser = { ...enabledUser, credentialEpoch: 1 };

    for (const epoch of [undefined, 0, null, -1, 2, 1.5]) {
      expect(() =>
        assertUserCredentialIsValid(rotatedUser, epoch as number | undefined),
      ).toThrow(
        expect.objectContaining({ code: AuthExceptionCode.UNAUTHENTICATED }),
      );
    }

    expect(() => assertUserCredentialIsValid(rotatedUser, 1)).not.toThrow();
  });
});
