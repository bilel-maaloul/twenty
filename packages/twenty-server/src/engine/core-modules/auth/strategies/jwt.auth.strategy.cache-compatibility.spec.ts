import { randomUUID } from 'crypto';

import { Reflector } from '@nestjs/core';

import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { hashPassword } from 'src/engine/core-modules/auth/auth.util';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { UserEntityCacheProviderService } from 'src/engine/core-modules/user/services/user-entity-cache-provider.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { JwtAuthStrategy } from './jwt.auth.strategy';

describe('pre-Phase-1 user cache compatibility', () => {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const userWorkspaceId = randomUUID();
  const email = 'existing@example.com';
  const password = 'existing-password';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  const createScenario = async ({
    credentialEpoch = 0,
    disabled = false,
    mustChangePassword = false,
  }: {
    credentialEpoch?: number;
    disabled?: boolean;
    mustChangePassword?: boolean;
  } = {}) => {
    const cacheEntries = new Map<string, unknown>();
    const persistedUser = Object.assign(new UserEntity(), {
      id: userId,
      email,
      firstName: 'Existing',
      lastName: 'User',
      isEmailVerified: true,
      passwordHash,
      disabled,
      mustChangePassword,
      credentialEpoch,
      temporaryPasswordExpiresAt: null,
      userWorkspaces: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null as unknown as Date,
    });
    const userRepository = {
      findOne: jest.fn(async () => persistedUser),
    };
    const cacheStorage = {
      get: jest.fn(async (key: string) => cacheEntries.get(key)),
      mget: jest.fn(async (keys: string[]) =>
        keys.map((key) => cacheEntries.get(key)),
      ),
      mset: jest.fn(async (entries: Array<{ key: string; value: unknown }>) => {
        for (const entry of entries) {
          cacheEntries.set(entry.key, entry.value);
        }
      }),
      mdel: jest.fn(async (keys: string[]) => {
        for (const key of keys) {
          cacheEntries.delete(key);
        }
      }),
    };
    const userProvider = new UserEntityCacheProviderService(
      userRepository as never,
    );
    const coreEntityCacheService = new CoreEntityCacheService(
      cacheStorage as never,
      { getProviders: () => [{ instance: userProvider }] } as never,
      new Reflector(),
    );

    await coreEntityCacheService.onModuleInit();

    // Redis still contains the prior release's user shape when the new server starts.
    cacheEntries.set(`user:${userId}:data`, {
      id: userId,
      email,
      disabled: false,
    });
    cacheEntries.set(`user:${userId}:hash`, 'old-user-hash');
    cacheEntries.set(`workspace:${workspaceId}:data`, {
      id: workspaceId,
      activationStatus: WorkspaceActivationStatus.PENDING_CREATION,
    });
    cacheEntries.set(`workspace:${workspaceId}:hash`, 'workspace-hash');
    cacheEntries.set(`user-workspace:${userWorkspaceId}:data`, {
      id: userWorkspaceId,
      userId,
      workspaceId,
    });
    cacheEntries.set(
      `user-workspace:${userWorkspaceId}:hash`,
      'membership-hash',
    );

    const jwtWrapperService = {
      extractJwtFromRequest: jest.fn(
        () => (request: { headers: { authorization?: string } }) =>
          request.headers.authorization?.replace('Bearer ', ''),
      ),
      resolveVerificationKey: jest.fn(async () => ({
        key: 'test-key',
        algorithm: 'HS256',
      })),
      verifyJwtToken: jest.fn(),
      decode: jest.fn(),
      signAsyncOrThrow: jest.fn(),
    };
    const strategy = new JwtAuthStrategy(
      jwtWrapperService as never,
      {} as never,
      {} as never,
      coreEntityCacheService,
      {} as never,
      userRepository as never,
      {} as never,
    );
    const userSessionService = {
      resolveSession: jest.fn(),
    };
    const accessTokenService = new AccessTokenService(
      jwtWrapperService as never,
      strategy,
      { get: () => '1h' } as never,
      userRepository as never,
      {
        findOne: jest.fn(async () => ({
          id: workspaceId,
          activationStatus: WorkspaceActivationStatus.PENDING_CREATION,
        })),
      } as never,
      {} as never,
      {
        findOne: jest.fn(async () => ({ id: userWorkspaceId, workspaceId })),
      } as never,
      userSessionService as never,
      {
        extractSessionTokenFromRequest: jest.fn(() => 'session-token'),
      } as never,
    );
    const authService = Object.assign(Object.create(AuthService.prototype), {
      userRepository,
      twentyConfigService: { get: () => false },
    }) as AuthService;

    return {
      accessTokenService,
      authService,
      cacheEntries,
      cacheStorage,
      coreEntityCacheService,
      jwtWrapperService,
      persistedUser,
      strategy,
      userRepository,
      userSessionService,
    };
  };

  it('refreshes the old cache and allows an existing user through login and a protected session', async () => {
    const scenario = await createScenario();
    const user = await scenario.authService.validateLoginWithPassword({
      email,
      password,
    } as never);

    expect(user.user.id).toBe(userId);

    const legacySessionPayload = {
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      authProvider: AuthProviderEnum.Password,
      type: JwtTokenTypeEnum.ACCESS,
    };

    scenario.userSessionService.resolveSession.mockResolvedValue({
      payload: legacySessionPayload,
      authenticatedAt: new Date(),
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: {},
      } as never),
    ).resolves.toMatchObject({ user: { id: userId, credentialEpoch: 0 } });
    expect(scenario.cacheStorage.mdel).toHaveBeenCalledWith([
      `user:${userId}:data`,
      `user:${userId}:hash`,
    ]);
    expect(scenario.userRepository.findOne).toHaveBeenCalledWith({
      where: { id: userId },
    });
  });

  it('refreshes the old cache and rejects a legacy credential after rotation', async () => {
    const scenario = await createScenario({ credentialEpoch: 2 });

    scenario.jwtWrapperService.decode.mockReturnValue({
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      type: JwtTokenTypeEnum.ACCESS,
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: { authorization: 'Bearer legacy-token' },
      } as never),
    ).rejects.toMatchObject({ code: AuthExceptionCode.UNAUTHENTICATED });
    expect(scenario.userRepository.findOne).toHaveBeenCalledWith({
      where: { id: userId },
    });
    expect(scenario.cacheEntries.get(`user:${userId}:data`)).toMatchObject({
      credentialEpoch: 2,
    });
  });

  it('rejects an old token and accepts the new epoch when a complete cache stays stale', async () => {
    const scenario = await createScenario();

    scenario.cacheEntries.set(`user:${userId}:data`, {
      id: userId,
      email,
      firstName: 'Cached',
      lastName: 'User',
      disabled: false,
      mustChangePassword: false,
      credentialEpoch: 0,
    });
    scenario.persistedUser.credentialEpoch = 1;

    scenario.jwtWrapperService.decode.mockReturnValue({
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      type: JwtTokenTypeEnum.ACCESS,
      credentialEpoch: 0,
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: { authorization: 'Bearer old-token' },
      } as never),
    ).rejects.toMatchObject({ code: AuthExceptionCode.UNAUTHENTICATED });

    expect(scenario.cacheEntries.get(`user:${userId}:data`)).toMatchObject({
      credentialEpoch: 0,
    });
    expect(scenario.userRepository.findOne).toHaveBeenCalledWith({
      where: { id: userId },
      select: {
        id: true,
        disabled: true,
        mustChangePassword: true,
        credentialEpoch: true,
      },
    });

    scenario.userSessionService.resolveSession.mockResolvedValue({
      payload: {
        sub: userId,
        userId,
        workspaceId,
        userWorkspaceId,
        type: JwtTokenTypeEnum.ACCESS,
        credentialEpoch: 0,
      },
      authenticatedAt: new Date(),
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: {},
      } as never),
    ).rejects.toMatchObject({ code: AuthExceptionCode.UNAUTHENTICATED });

    scenario.jwtWrapperService.decode.mockReturnValue({
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      type: JwtTokenTypeEnum.ACCESS,
      credentialEpoch: 1,
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: { authorization: 'Bearer new-token' },
      } as never),
    ).resolves.toMatchObject({ user: { id: userId, credentialEpoch: 1 } });
  });

  it('rejects a legacy credential against a complete stale cache after rotation', async () => {
    const scenario = await createScenario();

    scenario.cacheEntries.set(`user:${userId}:data`, {
      id: userId,
      email,
      disabled: false,
      mustChangePassword: false,
      credentialEpoch: 0,
    });
    scenario.persistedUser.credentialEpoch = 1;
    scenario.jwtWrapperService.decode.mockReturnValue({
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      type: JwtTokenTypeEnum.ACCESS,
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: { authorization: 'Bearer legacy-token' },
      } as never),
    ).rejects.toMatchObject({ code: AuthExceptionCode.UNAUTHENTICATED });
    expect(scenario.cacheEntries.get(`user:${userId}:data`)).toMatchObject({
      credentialEpoch: 0,
    });
  });

  it('fails closed when authoritative credential state cannot be read', async () => {
    const scenario = await createScenario();

    scenario.cacheEntries.set(`user:${userId}:data`, {
      id: userId,
      email,
      disabled: false,
      mustChangePassword: false,
      credentialEpoch: 0,
    });
    scenario.userRepository.findOne.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    scenario.jwtWrapperService.decode.mockReturnValue({
      sub: userId,
      userId,
      workspaceId,
      userWorkspaceId,
      type: JwtTokenTypeEnum.ACCESS,
      credentialEpoch: 0,
    });

    await expect(
      scenario.accessTokenService.validateTokenByRequest({
        headers: { authorization: 'Bearer cached-token' },
      } as never),
    ).rejects.toThrow('database unavailable');
  });

  it.each([
    { disabled: true, mustChangePassword: false },
    { disabled: false, mustChangePassword: true },
  ])(
    'uses authoritative restricted state despite an old cache: %p',
    async (state) => {
      const scenario = await createScenario(state);
      scenario.cacheEntries.set(`user:${userId}:data`, {
        id: userId,
        email,
        disabled: false,
        mustChangePassword: false,
        credentialEpoch: 0,
      });

      scenario.jwtWrapperService.decode.mockReturnValue({
        sub: userId,
        userId,
        workspaceId,
        userWorkspaceId,
        type: JwtTokenTypeEnum.ACCESS,
      });

      await expect(
        scenario.accessTokenService.validateTokenByRequest({
          headers: { authorization: 'Bearer legacy-token' },
        } as never),
      ).rejects.toMatchObject({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION });
      expect(scenario.cacheEntries.get(`user:${userId}:data`)).toMatchObject({
        disabled: false,
        mustChangePassword: false,
        credentialEpoch: 0,
      });
    },
  );

  it.each(['disabled', 'mustChangePassword', 'credentialEpoch'] as const)(
    'refreshes a workspace-agnostic user cache missing %s',
    async (missingField) => {
      const scenario = await createScenario();
      const cachedUser = {
        id: userId,
        email,
        disabled: false,
        mustChangePassword: false,
        credentialEpoch: 0,
      };

      Reflect.deleteProperty(cachedUser, missingField);
      scenario.cacheEntries.set(`user:${userId}:data`, cachedUser);

      await expect(
        scenario.strategy.validate({
          sub: userId,
          userId,
          authProvider: AuthProviderEnum.Password,
          type: JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
        }),
      ).resolves.toMatchObject({ user: { id: userId, credentialEpoch: 0 } });
      expect(scenario.userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    },
  );
});
