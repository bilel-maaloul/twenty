import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { LoginTokenService } from './login-token.service';

describe('LoginTokenService', () => {
  const jwtWrapperService = {
    decode: jest.fn(),
    signAsyncOrThrow: jest.fn(),
    verifyJwtToken: jest.fn(),
  };
  const twentyConfigService = {
    get: jest.fn().mockReturnValue('1h'),
  };
  const userRepository = {
    findOneBy: jest.fn().mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      disabled: false,
      mustChangePassword: false,
      credentialEpoch: 0,
    }),
  };
  const service = new LoginTokenService(
    jwtWrapperService as never,
    twentyConfigService as never,
    userRepository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not generate a login token without an authentication provider', async () => {
    await expect(
      service.generateLoginToken(
        'test@example.com',
        'workspace-id',
        undefined as never,
      ),
    ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });

    expect(jwtWrapperService.signAsyncOrThrow).not.toHaveBeenCalled();
  });

  it('rejects a login token without an authentication provider', async () => {
    jwtWrapperService.decode.mockReturnValue({
      type: JwtTokenTypeEnum.LOGIN,
      sub: 'test@example.com',
      workspaceId: 'workspace-id',
    });

    await expect(service.verifyLoginToken('login-token')).rejects.toMatchObject(
      {
        code: AuthExceptionCode.UNAUTHENTICATED,
      },
    );
  });

  it('embeds the current user epoch in a login token', async () => {
    await service.generateLoginToken(
      'test@example.com',
      'workspace-id',
      AuthProviderEnum.Password,
    );

    expect(jwtWrapperService.signAsyncOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ credentialEpoch: 0 }),
      expect.any(Object),
    );
  });

  it('rejects a legacy login token after the user epoch changes', async () => {
    userRepository.findOneBy.mockResolvedValueOnce({
      id: 'user-id',
      disabled: false,
      mustChangePassword: false,
      credentialEpoch: 1,
    });
    jwtWrapperService.decode.mockReturnValue({
      type: JwtTokenTypeEnum.LOGIN,
      sub: 'test@example.com',
      workspaceId: 'workspace-id',
      authProvider: AuthProviderEnum.Password,
    });

    await expect(service.verifyLoginToken('login-token')).rejects.toMatchObject(
      {
        code: AuthExceptionCode.UNAUTHENTICATED,
      },
    );
  });
});
