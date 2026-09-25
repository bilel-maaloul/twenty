import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService user credential state', () => {
  let storedToken: {
    id: string;
    type: AppTokenType;
    revokedAt: Date | null;
  };
  const user = {
    id: 'user-id',
    disabled: false,
    mustChangePassword: false,
    credentialEpoch: 0,
  };
  const jwtWrapperService = {
    verifyJwtToken: jest.fn(),
    decode: jest.fn(),
    signAsyncOrThrow: jest.fn(),
  };
  const twentyConfigService = {
    get: jest.fn().mockReturnValue('60d'),
  };
  const appTokenRepository = {
    findOneBy: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'token-id' })),
  };
  const userRepository = {
    findOneBy: jest.fn(),
  };
  const service = new RefreshTokenService(
    jwtWrapperService as never,
    twentyConfigService as never,
    appTokenRepository as never,
    userRepository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findOneBy.mockResolvedValue({ ...user });
    storedToken = {
      id: 'token-id',
      type: AppTokenType.RefreshToken,
      revokedAt: null,
    };
    appTokenRepository.findOneBy.mockImplementation(
      async ({ id, type }: { id: string; type: AppTokenType }) =>
        id === storedToken.id && type === storedToken.type ? storedToken : null,
    );
    jwtWrapperService.decode.mockReturnValue({
      type: JwtTokenTypeEnum.REFRESH,
      sub: user.id,
      jti: 'token-id',
      credentialEpoch: 0,
    });
  });

  it('loads a legitimate refresh AppToken with its purpose constrained in the database query', async () => {
    await expect(
      service.verifyRefreshToken('refresh-jwt'),
    ).resolves.toMatchObject({
      token: storedToken,
      user: { id: user.id },
    });
    expect(appTokenRepository.findOneBy).toHaveBeenCalledWith({
      id: 'token-id',
      type: AppTokenType.RefreshToken,
    });
  });

  it('does not load a first-password AppToken with the same identifier', async () => {
    storedToken.type = AppTokenType.FirstPasswordCreation;

    await expect(
      service.verifyRefreshToken('refresh-jwt'),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.INVALID_INPUT,
    });
    expect(appTokenRepository.findOneBy).toHaveBeenCalledWith({
      id: storedToken.id,
      type: AppTokenType.RefreshToken,
    });
    expect(userRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('preserves revoked-token and missing-user rejection', async () => {
    storedToken.revokedAt = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);

    await expect(
      service.verifyRefreshToken('refresh-jwt'),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });

    storedToken.revokedAt = null;
    userRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(
      service.verifyRefreshToken('refresh-jwt'),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.INVALID_INPUT,
    });
  });

  it('includes the current user epoch in new refresh tokens', async () => {
    userRepository.findOneBy.mockResolvedValueOnce({
      ...user,
      credentialEpoch: 2,
    });

    await service.generateRefreshToken({
      userId: user.id,
      authProvider: AuthProviderEnum.Password,
      targetedTokenType: JwtTokenTypeEnum.ACCESS,
    });

    expect(jwtWrapperService.signAsyncOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ credentialEpoch: 2 }),
      expect.any(Object),
    );
  });

  it('accepts a legacy refresh token only for a user at epoch zero', async () => {
    jwtWrapperService.decode.mockReturnValueOnce({
      type: JwtTokenTypeEnum.REFRESH,
      sub: user.id,
      jti: 'token-id',
    });

    await expect(service.verifyRefreshToken('legacy')).resolves.toMatchObject({
      user: { id: user.id },
    });
  });

  it('rejects a recently revoked legacy token after credential rotation', async () => {
    userRepository.findOneBy.mockResolvedValueOnce({
      ...user,
      credentialEpoch: 1,
    });
    jwtWrapperService.decode.mockReturnValueOnce({
      type: JwtTokenTypeEnum.REFRESH,
      sub: user.id,
      jti: 'token-id',
    });
    appTokenRepository.findOneBy.mockResolvedValueOnce({
      id: 'token-id',
      revokedAt: new Date(),
    });

    await expect(service.verifyRefreshToken('legacy')).rejects.toMatchObject({
      code: AuthExceptionCode.UNAUTHENTICATED,
    });
  });

  it.each([
    { disabled: true, mustChangePassword: false },
    { disabled: false, mustChangePassword: true },
  ])('rejects a user who cannot authenticate: %p', async (state) => {
    userRepository.findOneBy.mockResolvedValueOnce({ ...user, ...state });

    await expect(service.verifyRefreshToken('token')).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });
});
