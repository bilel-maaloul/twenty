import { type CanActivate, Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage';
import { TypeMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/type-metadata.storage';

import { ApiKeyService } from 'src/engine/core-modules/api-key/services/api-key.service';
import { AppTokenEntity } from 'src/engine/core-modules/app-token/app-token.entity';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { AvailableWorkspacesAndAccessTokensDTO } from 'src/engine/core-modules/auth/dto/available-workspaces-and-access-tokens.dto';
import { CreateFirstPasswordInput } from 'src/engine/core-modules/auth/dto/create-first-password.input';
import { LoginTokenDTO } from 'src/engine/core-modules/auth/dto/login-token.dto';
import { EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { ImpersonationAuthorizationService } from 'src/engine/core-modules/impersonation/services/impersonation-authorization.service';
import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { AccessTokenService } from 'src/engine/core-modules/auth/token/services/access-token.service';
import { RefreshTokenService } from 'src/engine/core-modules/auth/token/services/refresh-token.service';
import { SsoExchangeTokenService } from 'src/engine/core-modules/auth/token/services/sso-exchange-token.service';
import { WorkspaceAgnosticTokenService } from 'src/engine/core-modules/auth/token/services/workspace-agnostic-token.service';
import { CaptchaGuard } from 'src/engine/core-modules/captcha/captcha.guard';
import { FirstPasswordCookieService } from 'src/engine/core-modules/auth/services/first-password-cookie.service';
import {
  FirstPasswordCreationService,
  FirstPasswordInputRejectedException,
} from 'src/engine/core-modules/auth/services/first-password-creation.service';
import { EmailPasswordResetLinkInput } from 'src/engine/core-modules/auth/dto/email-password-reset-link.input';
import { type I18nContext } from 'src/engine/core-modules/i18n/types/i18n-context.type';
import {
  ThrottlerException,
  ThrottlerExceptionCode,
} from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { SubdomainManagerService } from 'src/engine/core-modules/domain/subdomain-manager/services/subdomain-manager.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { EmailVerificationService } from 'src/engine/core-modules/email-verification/services/email-verification.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { FileCorePictureService } from 'src/engine/core-modules/file/file-core-picture/services/file-core-picture.service';
import { UserSessionCookieService } from 'src/engine/core-modules/user-session/services/user-session-cookie.service';
import { UserSessionService } from 'src/engine/core-modules/user-session/services/user-session.service';
import { SsoService } from 'src/engine/core-modules/sso/services/sso.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { TwoFactorAuthenticationService } from 'src/engine/core-modules/two-factor-authentication/two-factor-authentication.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

import { AuthResolver } from './auth.resolver';

import { AuthService } from './services/auth.service';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { ResetPasswordService } from './services/reset-password.service';
import { EmailVerificationTokenService } from './token/services/email-verification-token.service';
import { LoginTokenService } from './token/services/login-token.service';
import { RenewTokenService } from './token/services/renew-token.service';
import { TransientTokenService } from './token/services/transient-token.service';

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let appTokenRepository: { remove: jest.Mock };
  let authService: {
    validateLoginWithPassword: jest.Mock;
    checkAccessForSignIn: jest.Mock;
    findWorkspaceForSignInUp: jest.Mock;
    formatUserDataPayload: jest.Mock;
    signInUp: jest.Mock;
  };
  let emailVerificationService: { sendVerificationEmail: jest.Mock };
  let emailVerificationTokenService: {
    validateEmailVerificationTokenOrThrow: jest.Mock;
  };
  let loginTokenService: { generateLoginToken: jest.Mock };
  let resetPasswordService: ResetPasswordService;
  let signInUpService: { signUpOnNewWorkspace: jest.Mock };
  let throttlerService: ThrottlerService;
  let userService: {
    findUserByEmail: jest.Mock;
    findUserByIdOrThrow: jest.Mock;
    markEmailAsVerified: jest.Mock;
  };
  let workspaceDomainsService: {
    buildWorkspaceURL: jest.Mock;
    getWorkspaceByOriginOrDefaultWorkspace: jest.Mock;
    getWorkspaceUrls: jest.Mock;
  };
  let firstPasswordCookieService: {
    assertAllowedOrigin: jest.Mock;
    attachCapability: jest.Mock;
    extractCapability: jest.Mock;
    clearCapability: jest.Mock;
  };
  let firstPasswordCreationService: {
    issueCapability: jest.Mock;
    createPermanentPassword: jest.Mock;
  };
  let refreshTokenService: { generateRefreshToken: jest.Mock };
  let workspaceAgnosticTokenService: {
    generateWorkspaceAgnosticToken: jest.Mock;
  };
  let userWorkspaceService: {
    findAvailableWorkspacesByEmail: jest.Mock;
    setLoginTokenToAvailableWorkspacesWhenAuthProviderMatch: jest.Mock;
  };
  let userSessionService: { issueSessionForTokenPair: jest.Mock };
  const mock_CaptchaGuard: CanActivate = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        {
          provide: getRepositoryToken(AppTokenEntity),
          useValue: {
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {},
        },
        {
          provide: AuthService,
          useValue: {
            validateLoginWithPassword: jest.fn(),
            checkAccessForSignIn: jest.fn(),
            findWorkspaceForSignInUp: jest.fn(),
            formatUserDataPayload: jest.fn(),
            signInUp: jest.fn(),
          },
        },
        {
          provide: RefreshTokenService,
          useValue: { generateRefreshToken: jest.fn() },
        },
        {
          provide: UserService,
          useValue: {
            findUserByEmail: jest.fn(),
            findUserByIdOrThrow: jest.fn(),
            markEmailAsVerified: jest.fn(),
          },
        },
        {
          provide: WorkspaceDomainsService,
          useValue: {
            buildWorkspaceURL: jest
              .fn()
              .mockResolvedValue(new URL('http://localhost:3001')),
            getWorkspaceByOriginOrDefaultWorkspace: jest.fn(),
            getWorkspaceUrls: jest.fn(),
          },
        },
        {
          provide: SubdomainManagerService,
          useValue: {},
        },
        {
          provide: FileCorePictureService,
          useValue: {},
        },
        {
          provide: UserSessionService,
          useValue: {
            issueSessionForTokenPair: jest.fn(),
          },
        },
        {
          provide: UserSessionCookieService,
          useValue: {},
        },
        {
          provide: FirstPasswordCookieService,
          useValue: {
            assertAllowedOrigin: jest.fn(),
            attachCapability: jest.fn(),
            extractCapability: jest.fn(),
            clearCapability: jest.fn(),
          },
        },
        {
          provide: FirstPasswordCreationService,
          useValue: {
            issueCapability: jest.fn(),
            createPermanentPassword: jest.fn(),
          },
        },
        {
          provide: UserWorkspaceService,
          useValue: {
            findAvailableWorkspacesByEmail: jest.fn(),
            findFirstWorkspaceByUserId: jest.fn(),
            setLoginTokenToAvailableWorkspacesWhenAuthProviderMatch: jest.fn(),
          },
        },
        {
          provide: RenewTokenService,
          useValue: {},
        },
        {
          provide: SignInUpService,
          useValue: {
            signUpOnNewWorkspace: jest.fn(),
          },
        },
        {
          provide: ApiKeyService,
          useValue: {},
        },
        {
          provide: AccessTokenService,
          useValue: {},
        },
        {
          provide: ResetPasswordService,
          useValue: {
            generateAndSendPasswordResetLink: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: ThrottlerService,
          useValue: {
            tokenBucketThrottleOrThrow: jest.fn(),
          },
        },
        {
          provide: LoginTokenService,
          useValue: {
            generateLoginToken: jest.fn(),
          },
        },
        {
          provide: WorkspaceAgnosticTokenService,
          useValue: {
            generateWorkspaceAgnosticToken: jest.fn(),
          },
        },
        {
          provide: SsoExchangeTokenService,
          useValue: {},
        },
        {
          provide: TransientTokenService,
          useValue: {},
        },
        {
          provide: EmailVerificationService,
          useValue: {
            sendVerificationEmail: jest.fn(),
          },
        },
        {
          provide: EmailVerificationTokenService,
          useValue: {
            validateEmailVerificationTokenOrThrow: jest.fn(),
          },
        },
        {
          provide: ImpersonationAuthorizationService,
          useValue: {},
        },
        {
          provide: PermissionsService,
          useValue: {},
        },
        {
          provide: FeatureFlagService,
          useValue: {},
        },
        {
          provide: SsoService,
          useValue: {},
        },
        {
          provide: TwoFactorAuthenticationService,
          useValue: {},
        },
        {
          provide: TwentyConfigService,
          useValue: {},
        },
        {
          provide: EventLogEmitterService,
          useValue: {
            createContext: jest.fn().mockReturnValue({
              insertWorkspaceEvent: jest.fn(),
            }),
          },
        },
      ],
    })
      .overrideGuard(CaptchaGuard)
      .useValue(mock_CaptchaGuard)
      .compile();

    resolver = module.get<AuthResolver>(AuthResolver);
    appTokenRepository = module.get(getRepositoryToken(AppTokenEntity));
    authService = module.get(AuthService);
    firstPasswordCookieService = module.get(FirstPasswordCookieService);
    firstPasswordCreationService = module.get(FirstPasswordCreationService);
    emailVerificationService = module.get(EmailVerificationService);
    emailVerificationTokenService = module.get(EmailVerificationTokenService);
    loginTokenService = module.get(LoginTokenService);
    resetPasswordService =
      module.get<ResetPasswordService>(ResetPasswordService);
    signInUpService = module.get(SignInUpService);
    throttlerService = module.get<ThrottlerService>(ThrottlerService);
    userService = module.get(UserService);
    workspaceDomainsService = module.get(WorkspaceDomainsService);
    refreshTokenService = module.get(RefreshTokenService);
    workspaceAgnosticTokenService = module.get(WorkspaceAgnosticTokenService);
    userWorkspaceService = module.get(UserWorkspaceService);
    userSessionService = module.get(UserSessionService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('restricted first-password login', () => {
    const user = {
      id: 'first-user',
      email: 'first@example.com',
      mustChangePassword: true,
    };
    const credentials = {
      email: user.email,
      password: 'temporary-password',
      captchaToken: 'valid-captcha',
    };
    const response = {};
    const context = {
      req: {
        res: response,
        ip: '203.0.113.42',
        headers: { origin: 'https://front.example.com' },
      },
    };

    beforeEach(() => {
      authService.validateLoginWithPassword.mockResolvedValue({
        kind: 'firstPasswordCreation',
        user,
      });
      firstPasswordCreationService.issueCapability.mockResolvedValue({
        capability: 'opaque-capability',
        expiresAt: new Date('2026-09-24T12:05:00.000Z'),
      });
      workspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace.mockResolvedValue(
        {
          id: 'workspace-id',
        },
      );
    });

    it('preserves both existing GraphQL login result type names', () => {
      LazyMetadataStorage.load([AuthResolver]);

      const mutations = TypeMetadataStorage.getMutationsMetadata();
      const signInMutation = mutations.find(
        (mutation) => mutation.methodName === 'signIn',
      );
      const workspaceLoginMutation = mutations.find(
        (mutation) => mutation.methodName === 'getLoginTokenFromCredentials',
      );

      expect(signInMutation?.typeFn()).toBe(
        AvailableWorkspacesAndAccessTokensDTO,
      );
      expect(
        TypeMetadataStorage.getObjectTypeMetadataByTarget(
          AvailableWorkspacesAndAccessTokensDTO,
        )?.name,
      ).toBe('AvailableWorkspacesAndAccessTokens');
      expect(workspaceLoginMutation?.typeFn()).toBe(LoginTokenDTO);
      expect(
        TypeMetadataStorage.getObjectTypeMetadataByTarget(LoginTokenDTO)?.name,
      ).toBe('LoginToken');
    });

    it('preserves normal global sign-in values and returns false for the restricted signal', async () => {
      authService.validateLoginWithPassword.mockResolvedValue({
        kind: 'normal',
        user,
      });
      userWorkspaceService.findAvailableWorkspacesByEmail.mockResolvedValue([
        { id: 'workspace-id' },
      ]);
      userWorkspaceService.setLoginTokenToAvailableWorkspacesWhenAuthProviderMatch.mockResolvedValue(
        { workspaces: [{ id: 'workspace-id' }] },
      );
      workspaceAgnosticTokenService.generateWorkspaceAgnosticToken.mockResolvedValue(
        { token: 'access-token' },
      );
      refreshTokenService.generateRefreshToken.mockResolvedValue({
        token: 'refresh-token',
      });

      await expect(
        resolver.signIn(credentials, context as never),
      ).resolves.toEqual({
        availableWorkspaces: { workspaces: [{ id: 'workspace-id' }] },
        tokens: {
          accessOrWorkspaceAgnosticToken: { token: 'access-token' },
          refreshToken: { token: 'refresh-token' },
        },
        requiresFirstPasswordCreation: false,
      });
      expect(userSessionService.issueSessionForTokenPair).toHaveBeenCalledTimes(
        1,
      );
      expect(
        firstPasswordCreationService.issueCapability,
      ).not.toHaveBeenCalled();
      expect(
        firstPasswordCookieService.attachCapability,
      ).not.toHaveBeenCalled();
    });

    it('preserves normal workspace login values and returns false for the restricted signal', async () => {
      authService.validateLoginWithPassword.mockResolvedValue({
        kind: 'normal',
        user,
      });
      loginTokenService.generateLoginToken.mockResolvedValue({
        token: 'normal-login-token',
      });

      await expect(
        resolver.getLoginTokenFromCredentials(
          credentials,
          'https://workspace.example.com',
          context as never,
        ),
      ).resolves.toEqual({
        loginToken: { token: 'normal-login-token' },
        requiresFirstPasswordCreation: false,
      });
      expect(
        firstPasswordCreationService.issueCapability,
      ).not.toHaveBeenCalled();
      expect(
        firstPasswordCookieService.attachCapability,
      ).not.toHaveBeenCalled();
    });

    it('returns only the restricted signal from global sign-in', async () => {
      const result = await resolver.signIn(credentials, context as never);

      expect(result).toEqual({
        requiresFirstPasswordCreation: true,
        tokens: null,
        availableWorkspaces: null,
      });
      expect(firstPasswordCookieService.attachCapability).toHaveBeenCalledWith(
        response,
        'opaque-capability',
        expect.any(Date),
      );
      expect(JSON.stringify(result)).not.toContain('opaque-capability');
      expect(loginTokenService.generateLoginToken).not.toHaveBeenCalled();
      expect(
        userWorkspaceService.findAvailableWorkspacesByEmail,
      ).not.toHaveBeenCalled();
      expect(
        workspaceAgnosticTokenService.generateWorkspaceAgnosticToken,
      ).not.toHaveBeenCalled();
      expect(refreshTokenService.generateRefreshToken).not.toHaveBeenCalled();
      expect(
        userSessionService.issueSessionForTokenPair,
      ).not.toHaveBeenCalled();
    });

    it('returns no login token from workspace sign-in', async () => {
      const result = await resolver.getLoginTokenFromCredentials(
        credentials,
        'https://workspace.example.com',
        context as never,
      );

      expect(result).toEqual({
        requiresFirstPasswordCreation: true,
        loginToken: null,
      });
      expect(JSON.stringify(result)).not.toContain('workspace-id');
      expect(loginTokenService.generateLoginToken).not.toHaveBeenCalled();
      expect(
        workspaceAgnosticTokenService.generateWorkspaceAgnosticToken,
      ).not.toHaveBeenCalled();
      expect(refreshTokenService.generateRefreshToken).not.toHaveBeenCalled();
      expect(
        userSessionService.issueSessionForTokenPair,
      ).not.toHaveBeenCalled();
    });

    it('consumes the cookie through the dedicated mutation and clears it', async () => {
      firstPasswordCookieService.extractCapability.mockReturnValue(
        'opaque-capability',
      );

      await expect(
        resolver.createFirstPassword(
          {
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          },
          context as never,
        ),
      ).resolves.toBe(true);
      expect(
        firstPasswordCreationService.createPermanentPassword,
      ).toHaveBeenCalledWith(
        'opaque-capability',
        'new-password-123',
        'new-password-123',
      );
      expect(firstPasswordCookieService.clearCapability).toHaveBeenCalledWith(
        response,
      );
      expect(throttlerService.tokenBucketThrottleOrThrow).toHaveBeenCalledWith(
        'first-password-creation:203.0.113.42',
        1,
        3,
        15 * 60 * 1000,
      );
      expect(
        (throttlerService.tokenBucketThrottleOrThrow as jest.Mock).mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        firstPasswordCreationService.createPermanentPassword.mock
          .invocationCallOrder[0],
      );
    });

    it('retains the cookie only for a service-confirmed correctable password error', async () => {
      firstPasswordCookieService.extractCapability.mockReturnValue(
        'opaque-capability',
      );
      firstPasswordCreationService.createPermanentPassword.mockRejectedValue(
        new FirstPasswordInputRejectedException(),
      );

      await expect(
        resolver.createFirstPassword(
          {
            newPassword: 'invalid-password',
            confirmPassword: 'invalid-password',
          },
          context as never,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });

      expect(firstPasswordCookieService.clearCapability).not.toHaveBeenCalled();
    });

    it('clears the cookie for an unmarked INVALID_INPUT error', async () => {
      firstPasswordCookieService.extractCapability.mockReturnValue(
        'opaque-capability',
      );
      firstPasswordCreationService.createPermanentPassword.mockRejectedValue(
        new AuthException('Invalid input', AuthExceptionCode.INVALID_INPUT),
      );

      await expect(
        resolver.createFirstPassword(
          {
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          },
          context as never,
        ),
      ).rejects.toMatchObject({ code: AuthExceptionCode.INVALID_INPUT });

      expect(firstPasswordCookieService.clearCapability).toHaveBeenCalledWith(
        response,
      );
    });

    it.each([
      [
        'invalid capability',
        new AuthException(
          'First-password capability is invalid or expired',
          AuthExceptionCode.FORBIDDEN_EXCEPTION,
        ),
      ],
      [
        'operational failure',
        new AuthException(
          'First-password creation failed',
          AuthExceptionCode.INTERNAL_SERVER_ERROR,
        ),
      ],
    ])('clears the cookie for %s', async (_name, error) => {
      firstPasswordCookieService.extractCapability.mockReturnValue(
        'opaque-capability',
      );
      firstPasswordCreationService.createPermanentPassword.mockRejectedValue(
        error,
      );

      await expect(
        resolver.createFirstPassword(
          {
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          },
          context as never,
        ),
      ).rejects.toBe(error);

      expect(firstPasswordCookieService.clearCapability).toHaveBeenCalledWith(
        response,
      );
    });

    it('clears the cookie and skips service work when throttled', async () => {
      (
        throttlerService.tokenBucketThrottleOrThrow as jest.Mock
      ).mockRejectedValueOnce(
        new ThrottlerException(
          'Limit reached',
          ThrottlerExceptionCode.LIMIT_REACHED,
        ),
      );

      await expect(
        resolver.createFirstPassword(
          {
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          },
          context as never,
        ),
      ).rejects.toMatchObject({
        code: ThrottlerExceptionCode.LIMIT_REACHED,
      });

      expect(firstPasswordCookieService.clearCapability).toHaveBeenCalledWith(
        response,
      );
      expect(
        firstPasswordCreationService.createPermanentPassword,
      ).not.toHaveBeenCalled();
    });

    it('fails closed with a sanitized operational error when throttle storage fails', async () => {
      (
        throttlerService.tokenBucketThrottleOrThrow as jest.Mock
      ).mockRejectedValueOnce(new Error('cache backend unavailable'));

      const error = await resolver
        .createFirstPassword(
          {
            newPassword: 'new-password-123',
            confirmPassword: 'new-password-123',
          },
          context as never,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AuthException);
      expect(error).toMatchObject({
        code: AuthExceptionCode.INTERNAL_SERVER_ERROR,
      });
      expect((error as AuthException).message).toBe(
        'First-password creation failed',
      );

      expect(firstPasswordCookieService.clearCapability).toHaveBeenCalledWith(
        response,
      );
      expect(
        firstPasswordCreationService.createPermanentPassword,
      ).not.toHaveBeenCalled();
    });

    it('leaves capability state untouched when DTO validation rejects before resolver execution', async () => {
      const validationPipe = new ResolverValidationPipe();

      await expect(
        validationPipe.transform(
          { newPassword: '', confirmPassword: '' },
          { type: 'body', metatype: CreateFirstPasswordInput },
        ),
      ).rejects.toBeDefined();

      expect(
        firstPasswordCreationService.createPermanentPassword,
      ).not.toHaveBeenCalled();
      expect(firstPasswordCookieService.clearCapability).not.toHaveBeenCalled();
    });
  });

  describe('password authentication provider propagation', () => {
    const user = { id: 'user-id', email: 'test@example.com' };
    const workspace = { id: 'workspace-id' };
    const loginToken = {
      token: 'login-token',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('uses the password provider when verifying an email on a workspace domain', async () => {
      const appToken = { user, context: {} };

      emailVerificationTokenService.validateEmailVerificationTokenOrThrow.mockResolvedValue(
        appToken,
      );
      userService.markEmailAsVerified.mockResolvedValue(user);
      workspaceDomainsService.getWorkspaceByOriginOrDefaultWorkspace.mockResolvedValue(
        workspace,
      );
      workspaceDomainsService.getWorkspaceUrls.mockReturnValue({
        subdomainUrl: 'https://workspace.example.com',
      });
      loginTokenService.generateLoginToken.mockResolvedValue(loginToken);

      await resolver.verifyEmailAndGetLoginToken(
        {
          email: user.email,
          emailVerificationToken: 'email-verification-token',
        },
        'https://workspace.example.com',
      );

      expect(loginTokenService.generateLoginToken).toHaveBeenCalledWith(
        user.email,
        workspace.id,
        AuthProviderEnum.Password,
      );
      expect(appTokenRepository.remove).toHaveBeenCalledWith(appToken);
    });

    it('uses the password provider when signing up in a workspace', async () => {
      authService.findWorkspaceForSignInUp.mockResolvedValue(workspace);
      userService.findUserByEmail.mockResolvedValue(null);
      authService.formatUserDataPayload.mockReturnValue({
        userData: { type: 'newUser' },
      });
      authService.signInUp.mockResolvedValue({ user, workspace });
      loginTokenService.generateLoginToken.mockResolvedValue(loginToken);
      workspaceDomainsService.getWorkspaceUrls.mockReturnValue({
        subdomainUrl: 'https://workspace.example.com',
      });

      await resolver.signUpInWorkspace({
        email: user.email,
        password: 'password',
      });

      expect(emailVerificationService.sendVerificationEmail).toHaveBeenCalled();
      expect(loginTokenService.generateLoginToken).toHaveBeenCalledWith(
        user.email,
        workspace.id,
        AuthProviderEnum.Password,
      );
    });

    it('rejects a missing provider before creating a new workspace', async () => {
      let caughtError: unknown;

      try {
        await resolver.signUpInNewWorkspace(
          { id: user.id } as never,
          undefined as never,
        );
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toMatchObject({
        code: AuthExceptionCode.UNAUTHENTICATED,
      });

      expect(userService.findUserByIdOrThrow).not.toHaveBeenCalled();
      expect(signInUpService.signUpOnNewWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('emailPasswordResetLink', () => {
    const emailPasswordResetInput = {
      email: 'test@example.com',
      workspaceId: 'workspace-id',
    } as EmailPasswordResetLinkInput;
    const context = { req: { locale: 'en' } } as I18nContext;

    it('should send the password reset link and return success', async () => {
      const result = await resolver.emailPasswordResetLink(
        emailPasswordResetInput,
        context,
      );

      expect(result).toEqual({ success: true });
      expect(
        resetPasswordService.generateAndSendPasswordResetLink,
      ).toHaveBeenCalledWith({
        email: 'test@example.com',
        workspaceId: 'workspace-id',
        locale: 'en',
      });
    });

    it('should return success without waiting for the link to be sent', async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      (
        resetPasswordService.generateAndSendPasswordResetLink as jest.Mock
      ).mockRejectedValue(new Error('database down'));

      const result = await resolver.emailPasswordResetLink(
        emailPasswordResetInput,
        context,
      );

      expect(result).toEqual({ success: true });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to send the password reset link',
        expect.any(Error),
      );
    });

    it('should throttle and send with a normalized email address', async () => {
      await resolver.emailPasswordResetLink(
        {
          email: 'TeSt@Example.com',
        } as EmailPasswordResetLinkInput,
        context,
      );

      expect(throttlerService.tokenBucketThrottleOrThrow).toHaveBeenCalledWith(
        'password-reset-email:test@example.com',
        1,
        expect.any(Number),
        expect.any(Number),
      );
      expect(
        resetPasswordService.generateAndSendPasswordResetLink,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );
    });

    it('should surface the throttling error without sending the link', async () => {
      (
        throttlerService.tokenBucketThrottleOrThrow as jest.Mock
      ).mockRejectedValue(
        new ThrottlerException(
          'Limit reached',
          ThrottlerExceptionCode.LIMIT_REACHED,
        ),
      );

      await expect(
        resolver.emailPasswordResetLink(emailPasswordResetInput, context),
      ).rejects.toThrow(ThrottlerException);
      expect(
        resetPasswordService.generateAndSendPasswordResetLink,
      ).not.toHaveBeenCalled();
    });

    it('should rethrow non throttling errors', async () => {
      (
        throttlerService.tokenBucketThrottleOrThrow as jest.Mock
      ).mockRejectedValue(new Error('cache down'));

      await expect(
        resolver.emailPasswordResetLink(emailPasswordResetInput, context),
      ).rejects.toThrow('cache down');
      expect(
        resetPasswordService.generateAndSendPasswordResetLink,
      ).not.toHaveBeenCalled();
    });
  });
});
