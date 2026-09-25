import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { WorkspaceAgnosticTokenService } from './workspace-agnostic-token.service';

describe('WorkspaceAgnosticTokenService user credential state', () => {
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
  const twentyConfigService = { get: jest.fn().mockReturnValue('1h') };
  const userRepository = { findOne: jest.fn() };
  const service = new WorkspaceAgnosticTokenService(
    jwtWrapperService as never,
    twentyConfigService as never,
    userRepository as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findOne.mockResolvedValue({ ...user });
    jwtWrapperService.decode.mockReturnValue({
      type: JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
      sub: user.id,
      credentialEpoch: 0,
    });
  });

  it('carries the current epoch in a newly issued user token', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      ...user,
      credentialEpoch: 2,
    });

    await service.generateWorkspaceAgnosticToken({
      userId: user.id,
      authProvider: AuthProviderEnum.Password,
    });

    expect(jwtWrapperService.signAsyncOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ credentialEpoch: 2 }),
      expect.any(Object),
    );
  });

  it('rejects a legacy token after the user epoch increases', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      ...user,
      credentialEpoch: 1,
    });
    jwtWrapperService.decode.mockReturnValueOnce({
      type: JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
      sub: user.id,
    });

    await expect(service.validateToken('legacy')).rejects.toMatchObject({
      code: AuthExceptionCode.UNAUTHENTICATED,
    });
  });

  it.each([
    {
      disabled: true,
      mustChangePassword: false,
    },
    {
      disabled: false,
      mustChangePassword: true,
    },
  ])('rejects a user with restricted authentication: %p', async (state) => {
    userRepository.findOne.mockResolvedValueOnce({ ...user, ...state });

    await expect(service.validateToken('token')).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });
});
