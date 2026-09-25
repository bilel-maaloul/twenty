import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

type UserAuthenticationState = Pick<
  UserEntity,
  'disabled' | 'mustChangePassword' | 'credentialEpoch'
>;

export const assertUserCanAuthenticate = (
  user: UserAuthenticationState,
): void => {
  if (user.disabled || user.mustChangePassword) {
    throw new AuthException(
      'User cannot use normal authentication',
      AuthExceptionCode.FORBIDDEN_EXCEPTION,
    );
  }
};

export const assertUserCredentialIsValid = (
  user: UserAuthenticationState,
  credentialEpoch?: number,
): void => {
  assertUserCanAuthenticate(user);

  const effectiveCredentialEpoch =
    credentialEpoch === undefined ? 0 : credentialEpoch;

  if (
    !Number.isSafeInteger(effectiveCredentialEpoch) ||
    effectiveCredentialEpoch < 0 ||
    effectiveCredentialEpoch !== user.credentialEpoch
  ) {
    throw new AuthException(
      'Credential is no longer valid',
      AuthExceptionCode.UNAUTHENTICATED,
    );
  }
};
