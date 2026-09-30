import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

type UserCanAuthenticateState = Pick<
  UserEntity,
  'disabled' | 'mustChangePassword'
>;

type UserAuthenticationState = UserCanAuthenticateState &
  Pick<
    UserEntity,
    'credentialEpoch' | 'passwordHash' | 'permanentPasswordExpiresAt'
  >;

export const isPermanentPasswordExpired = (
  user: Pick<
    UserEntity,
    'passwordHash' | 'mustChangePassword' | 'permanentPasswordExpiresAt'
  >,
  now = new Date(),
): boolean => {
  if (!user.passwordHash || user.mustChangePassword) {
    return false;
  }

  const expiration = user.permanentPasswordExpiresAt;

  return (
    !(expiration instanceof Date) ||
    !Number.isFinite(expiration.getTime()) ||
    expiration.getTime() <= now.getTime()
  );
};

export const assertUserCanAuthenticate = (
  user: UserCanAuthenticateState,
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

  if (isPermanentPasswordExpired(user)) {
    throw new AuthException(
      'Permanent password has expired',
      AuthExceptionCode.UNAUTHENTICATED,
    );
  }

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
