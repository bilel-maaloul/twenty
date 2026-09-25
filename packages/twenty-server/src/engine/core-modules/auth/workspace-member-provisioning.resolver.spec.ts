import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionFlagType } from 'twenty-shared/constants';

import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import {
  ProvisionWorkspaceMemberStatus,
  ResendTemporaryPasswordStatus,
} from 'src/engine/core-modules/auth/dto/admin-workspace-member-result.dto';
import { TemporaryPasswordProvisioningException } from 'src/engine/core-modules/auth/services/temporary-password-provisioning.service';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

import { WorkspaceMemberProvisioningResolver } from './workspace-member-provisioning.resolver';

const WORKSPACE = {
  id: 'workspace-id',
  defaultRoleId: 'default-role-id',
};

const createHarness = () => {
  const temporaryPasswordProvisioningService = {
    provisionUserWithTemporaryPassword: jest.fn(),
    rotateTemporaryPassword: jest.fn(),
  };
  const userWorkspaceService = {
    getWorkspaceMember: jest.fn(),
    checkUserWorkspaceExists: jest.fn(),
  };
  const roleValidationService = {
    validateRoleAssignableToUsersOrThrow: jest.fn(),
  };
  const permissionsService = {
    userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
  };
  const throttlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(1),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'INVITATION_SENDING_BY_EMAIL_THROTTLE_TTL_IN_MS') {
        return 604800000;
      }
      if (key === 'INVITATION_SENDING_BY_EMAIL_THROTTLE_LIMIT') return 10;
      if (key === 'INVITATION_SENDING_BY_WORKSPACE_THROTTLE_LIMIT') {
        return 500;
      }

      throw new Error(`Unexpected config ${key}`);
    }),
  };
  const userRepository = { findOne: jest.fn() };
  const resolver = new WorkspaceMemberProvisioningResolver(
    temporaryPasswordProvisioningService as never,
    userWorkspaceService as never,
    roleValidationService as never,
    permissionsService as never,
    throttlerService as never,
    twentyConfigService as never,
    userRepository as never,
  );

  return {
    resolver,
    temporaryPasswordProvisioningService,
    userWorkspaceService,
    roleValidationService,
    permissionsService,
    throttlerService,
    twentyConfigService,
    userRepository,
  };
};

describe('WorkspaceMemberProvisioningResolver', () => {
  describe('provisionWorkspaceMember', () => {
    const input = {
      email: ' PERSON@example.com ',
      firstName: ' Jane ',
      lastName: ' Doe ',
      roleId: 'selected-role-id',
    };

    it('requires access, user, and workspace authentication guards', () => {
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          WorkspaceMemberProvisioningResolver,
        ),
      ).toEqual([RequireAccessTokenGuard, UserAuthGuard, WorkspaceAuthGuard]);
    });

    it('rejects callers without the workspace member permission before provisioning', async () => {
      const harness = createHarness();
      harness.permissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
        false,
      );

      await expect(
        harness.resolver.provisionWorkspaceMember(
          input,
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).rejects.toMatchObject({
        code: PermissionsExceptionCode.PERMISSION_DENIED,
      } satisfies Partial<PermissionsException>);

      expect(
        harness.permissionsService.userHasWorkspaceSettingPermission,
      ).toHaveBeenCalledWith({
        userWorkspaceId: 'caller-user-workspace-id',
        workspaceId: WORKSPACE.id,
        setting: PermissionFlagType.WORKSPACE_MEMBERS,
      });
      expect(
        harness.temporaryPasswordProvisioningService
          .provisionUserWithTemporaryPassword,
      ).not.toHaveBeenCalled();
      expect(
        harness.roleValidationService.validateRoleAssignableToUsersOrThrow,
      ).not.toHaveBeenCalled();
    });

    it('validates the selected role and normalizes input before side effects', async () => {
      const harness = createHarness();
      harness.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword.mockResolvedValue(
        {
          userId: 'sensitive-user-id',
          userWasCreated: true,
          credentialEpoch: 12,
          temporaryPasswordEmail: 'sent',
          workspaceMembership: 'complete',
        },
      );

      const result = await harness.resolver.provisionWorkspaceMember(
        input,
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      expect(
        harness.roleValidationService.validateRoleAssignableToUsersOrThrow,
      ).toHaveBeenCalledWith('selected-role-id', WORKSPACE.id);
      expect(
        harness.temporaryPasswordProvisioningService
          .provisionUserWithTemporaryPassword,
      ).toHaveBeenCalledWith({
        email: 'person@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        workspace: WORKSPACE,
        roleId: 'selected-role-id',
      });
      expect(
        harness.roleValidationService.validateRoleAssignableToUsersOrThrow.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        harness.temporaryPasswordProvisioningService
          .provisionUserWithTemporaryPassword.mock.invocationCallOrder[0],
      );
      expect(result).toEqual({ status: ProvisionWorkspaceMemberStatus.READY });
      expect(Object.keys(result)).toEqual(['status']);
      expect(JSON.stringify(result)).not.toMatch(
        /password|userId|credentialEpoch|smtp|created/i,
      );
    });

    it('uses and validates the authenticated workspace default role when no role is selected', async () => {
      const harness = createHarness();
      harness.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword.mockResolvedValue(
        {
          userId: 'user-id',
          userWasCreated: false,
          temporaryPasswordEmail: 'not_sent_existing_user',
          workspaceMembership: 'complete',
        },
      );

      const result = await harness.resolver.provisionWorkspaceMember(
        { email: 'person@example.com', firstName: 'Jane', lastName: 'Doe' },
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      expect(
        harness.roleValidationService.validateRoleAssignableToUsersOrThrow,
      ).toHaveBeenCalledWith(WORKSPACE.defaultRoleId, WORKSPACE.id);
      expect(
        harness.temporaryPasswordProvisioningService
          .provisionUserWithTemporaryPassword,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace: WORKSPACE,
          roleId: WORKSPACE.defaultRoleId,
        }),
      );
      expect(result).toEqual({ status: ProvisionWorkspaceMemberStatus.READY });
    });

    it.each([
      [
        'disabled/deleted identity',
        new TemporaryPasswordProvisioningException(
          'unavailable',
          'internal detail',
        ),
        ProvisionWorkspaceMemberStatus.UNAVAILABLE,
      ],
      [
        'SMTP preflight failure',
        new TemporaryPasswordProvisioningException(
          'delivery_unavailable',
          'SMTP secret',
        ),
        ProvisionWorkspaceMemberStatus.DELIVERY_UNAVAILABLE,
      ],
      [
        'partial or uncertain provisioning',
        new TemporaryPasswordProvisioningException(
          'review_required',
          'DB detail',
        ),
        ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED,
      ],
    ])('returns a sanitized result for %s', async (_name, error, status) => {
      const harness = createHarness();
      harness.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword.mockRejectedValue(
        error,
      );

      const result = await harness.resolver.provisionWorkspaceMember(
        input,
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      expect(result).toEqual({ status });
      expect(JSON.stringify(result)).not.toMatch(
        /internal detail|SMTP secret|DB detail/,
      );
    });

    it('returns REVIEW_REQUIRED when membership reconciliation or delivery is uncertain', async () => {
      const harness = createHarness();
      harness.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword.mockResolvedValue(
        {
          userId: 'private-user-id',
          userWasCreated: true,
          temporaryPasswordEmail: 'failed_or_unknown',
          workspaceMembership: 'incomplete',
        },
      );

      await expect(
        harness.resolver.provisionWorkspaceMember(
          input,
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).resolves.toEqual({
        status: ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED,
      });
    });

    it('uses bounded workspace/action/target throttle keys without raw email', async () => {
      const harness = createHarness();
      harness.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword.mockResolvedValue(
        {
          userId: 'user-id',
          userWasCreated: false,
          temporaryPasswordEmail: 'not_sent_existing_user',
          workspaceMembership: 'complete',
        },
      );

      await harness.resolver.provisionWorkspaceMember(
        input,
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      const throttleKeys =
        harness.throttlerService.tokenBucketThrottleOrThrow.mock.calls.map(
          ([key]) => key,
        );
      expect(throttleKeys).toEqual([
        expect.stringMatching(
          /^admin-temporary-password-provisioning:workspace:workspace-id:email:[0-9a-f]{64}$/,
        ),
        'admin-temporary-password-provisioning:workspace:workspace-id:all',
      ]);
      expect(throttleKeys.join(' ')).not.toContain('person@example.com');
      expect(
        harness.throttlerService.tokenBucketThrottleOrThrow,
      ).toHaveBeenCalledWith(expect.any(String), 1, 10, 604800000);
      expect(
        harness.throttlerService.tokenBucketThrottleOrThrow,
      ).toHaveBeenCalledWith(expect.any(String), 1, 500, 604800000);
    });

    it('does not provision if throttling fails', async () => {
      const harness = createHarness();
      harness.throttlerService.tokenBucketThrottleOrThrow.mockRejectedValueOnce(
        new Error('throttled'),
      );

      await expect(
        harness.resolver.provisionWorkspaceMember(
          input,
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).rejects.toThrow('throttled');
      expect(
        harness.temporaryPasswordProvisioningService
          .provisionUserWithTemporaryPassword,
      ).not.toHaveBeenCalled();
    });
  });

  describe('resendTemporaryPassword', () => {
    const user = {
      id: 'user-id',
      disabled: false,
      mustChangePassword: true,
    };

    const setEligibleMember = (harness: ReturnType<typeof createHarness>) => {
      harness.userWorkspaceService.getWorkspaceMember.mockResolvedValue({
        id: 'member-id',
        userId: user.id,
      });
      harness.userWorkspaceService.checkUserWorkspaceExists.mockResolvedValue({
        id: 'user-workspace-id',
      });
      harness.userRepository.findOne.mockResolvedValue(user);
    };

    it('scopes the member lookup to the authenticated workspace before resolving its user', async () => {
      const harness = createHarness();
      setEligibleMember(harness);
      harness.temporaryPasswordProvisioningService.rotateTemporaryPassword.mockResolvedValue(
        { userId: user.id, credentialEpoch: 5, temporaryPasswordEmail: 'sent' },
      );

      const result = await harness.resolver.resendTemporaryPassword(
        'member-id',
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      expect(
        harness.userWorkspaceService.getWorkspaceMember,
      ).toHaveBeenCalledWith({
        workspaceMemberId: 'member-id',
        workspaceId: WORKSPACE.id,
      });
      expect(harness.userRepository.findOne).toHaveBeenCalledWith({
        where: { id: user.id },
      });
      expect(
        harness.temporaryPasswordProvisioningService.rotateTemporaryPassword,
      ).toHaveBeenCalledWith(user.id);
      expect(result).toEqual({ status: ResendTemporaryPasswordStatus.SENT });
      expect(Object.keys(result)).toEqual(['status']);
    });

    it('does not reveal or rotate members outside the workspace', async () => {
      const harness = createHarness();
      harness.userWorkspaceService.getWorkspaceMember.mockResolvedValue(null);

      await expect(
        harness.resolver.resendTemporaryPassword(
          'foreign-member-id',
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).resolves.toEqual({ status: ResendTemporaryPasswordStatus.UNAVAILABLE });
      expect(harness.userRepository.findOne).not.toHaveBeenCalled();
      expect(
        harness.temporaryPasswordProvisioningService.rotateTemporaryPassword,
      ).not.toHaveBeenCalled();
    });

    it('requires permission before looking up the workspace member', async () => {
      const harness = createHarness();
      harness.permissionsService.userHasWorkspaceSettingPermission.mockResolvedValue(
        false,
      );

      await expect(
        harness.resolver.resendTemporaryPassword(
          'member-id',
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).rejects.toMatchObject({
        code: PermissionsExceptionCode.PERMISSION_DENIED,
      });
      expect(
        harness.userWorkspaceService.getWorkspaceMember,
      ).not.toHaveBeenCalled();
    });

    it.each([
      ['permanent-password user', { ...user, mustChangePassword: false }],
      ['disabled user', { ...user, disabled: true }],
    ])(
      'returns unavailable for a %s without rotating',
      async (_name, ineligibleUser) => {
        const harness = createHarness();
        setEligibleMember(harness);
        harness.userRepository.findOne.mockResolvedValue(ineligibleUser);

        await expect(
          harness.resolver.resendTemporaryPassword(
            'member-id',
            'caller-user-workspace-id',
            WORKSPACE as never,
          ),
        ).resolves.toEqual({
          status: ResendTemporaryPasswordStatus.UNAVAILABLE,
        });
        expect(
          harness.temporaryPasswordProvisioningService.rotateTemporaryPassword,
        ).not.toHaveBeenCalled();
      },
    );

    it('requires an active workspace membership and maps uncertain rotation safely', async () => {
      const harness = createHarness();
      setEligibleMember(harness);
      harness.userWorkspaceService.checkUserWorkspaceExists.mockResolvedValue(
        null,
      );

      await expect(
        harness.resolver.resendTemporaryPassword(
          'member-id',
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).resolves.toEqual({ status: ResendTemporaryPasswordStatus.UNAVAILABLE });
      expect(harness.userRepository.findOne).not.toHaveBeenCalled();

      setEligibleMember(harness);
      harness.temporaryPasswordProvisioningService.rotateTemporaryPassword.mockRejectedValue(
        new TemporaryPasswordProvisioningException(
          'review_required',
          'unknown',
        ),
      );

      await expect(
        harness.resolver.resendTemporaryPassword(
          'member-id',
          'caller-user-workspace-id',
          WORKSPACE as never,
        ),
      ).resolves.toEqual({
        status: ResendTemporaryPasswordStatus.REVIEW_REQUIRED,
      });
    });

    it('throttles resend by workspace/user and workspace-wide limits', async () => {
      const harness = createHarness();
      setEligibleMember(harness);
      harness.temporaryPasswordProvisioningService.rotateTemporaryPassword.mockResolvedValue(
        { userId: user.id, credentialEpoch: 5, temporaryPasswordEmail: 'sent' },
      );

      await harness.resolver.resendTemporaryPassword(
        'member-id',
        'caller-user-workspace-id',
        WORKSPACE as never,
      );

      expect(
        harness.throttlerService.tokenBucketThrottleOrThrow,
      ).toHaveBeenNthCalledWith(
        1,
        'admin-temporary-password-resend:workspace:workspace-id:user:user-id',
        1,
        10,
        604800000,
      );
      expect(
        harness.throttlerService.tokenBucketThrottleOrThrow,
      ).toHaveBeenNthCalledWith(
        2,
        'admin-temporary-password-resend:workspace:workspace-id:all',
        1,
        500,
        604800000,
      );
    });
  });
});

describe('RequireAccessTokenGuard for provisioning mutations', () => {
  const guard = new RequireAccessTokenGuard();

  const contextFor = (tokenType: JwtTokenTypeEnum) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ tokenType }),
      }),
    }) as never;

  it('accepts a user access token', () => {
    expect(guard.canActivate(contextFor(JwtTokenTypeEnum.ACCESS))).toBe(true);
  });

  it.each([
    JwtTokenTypeEnum.API_KEY,
    JwtTokenTypeEnum.APPLICATION_ACCESS,
    JwtTokenTypeEnum.WORKSPACE_AGNOSTIC,
    JwtTokenTypeEnum.REFRESH,
  ])('rejects non-access credential type %s', (tokenType) => {
    expect(() => guard.canActivate(contextFor(tokenType))).toThrow(
      AuthException,
    );
    expect(() => guard.canActivate(contextFor(tokenType))).toThrow(
      expect.objectContaining({ code: AuthExceptionCode.FORBIDDEN_EXCEPTION }),
    );
  });
});
