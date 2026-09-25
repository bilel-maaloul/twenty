import { createHash } from 'node:crypto';

import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';
import { msg } from '@lingui/core/macro';
import { PermissionFlagType } from 'twenty-shared/constants';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import {
  ProvisionWorkspaceMemberResultDTO,
  ProvisionWorkspaceMemberStatus,
  ResendTemporaryPasswordResultDTO,
  ResendTemporaryPasswordStatus,
} from 'src/engine/core-modules/auth/dto/admin-workspace-member-result.dto';
import { ProvisionWorkspaceMemberInput } from 'src/engine/core-modules/auth/dto/provision-workspace-member.input';
import {
  TemporaryPasswordProvisioningException,
  TemporaryPasswordProvisioningService,
} from 'src/engine/core-modules/auth/services/temporary-password-provisioning.service';
import { ThrottlerGraphqlApiExceptionFilter } from 'src/engine/core-modules/throttler/filters/throttler-graphql-api-exception.filter';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { RoleValidationService } from 'src/engine/metadata-modules/role-validation/services/role-validation.service';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';

const TEMPORARY_PASSWORD_PROVISIONING_THROTTLE_PREFIX =
  'admin-temporary-password-provisioning';
const TEMPORARY_PASSWORD_RESEND_THROTTLE_PREFIX =
  'admin-temporary-password-resend';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseGuards(RequireAccessTokenGuard, UserAuthGuard, WorkspaceAuthGuard)
@UseFilters(
  PermissionsGraphqlApiExceptionFilter,
  ThrottlerGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class WorkspaceMemberProvisioningResolver {
  constructor(
    private readonly temporaryPasswordProvisioningService: TemporaryPasswordProvisioningService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly roleValidationService: RoleValidationService,
    private readonly permissionsService: PermissionsService,
    private readonly throttlerService: ThrottlerService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  @Mutation(() => ProvisionWorkspaceMemberResultDTO)
  async provisionWorkspaceMember(
    @Args() input: ProvisionWorkspaceMemberInput,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ProvisionWorkspaceMemberResultDTO> {
    await this.assertCanManageWorkspaceMembers(userWorkspaceId, workspace.id);

    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    if (!firstName || !lastName) {
      throw new AuthException(
        'First name and last name are required',
        AuthExceptionCode.INVALID_INPUT,
      );
    }

    const roleId = input.roleId ?? workspace.defaultRoleId;

    if (!roleId) {
      throw new PermissionsException(
        PermissionsExceptionMessage.DEFAULT_ROLE_NOT_FOUND,
        PermissionsExceptionCode.DEFAULT_ROLE_NOT_FOUND,
      );
    }

    await this.roleValidationService.validateRoleAssignableToUsersOrThrow(
      roleId,
      workspace.id,
    );
    await this.throttleProvisioning(workspace.id, email);

    try {
      const result =
        await this.temporaryPasswordProvisioningService.provisionUserWithTemporaryPassword(
          {
            email,
            firstName,
            lastName,
            workspace,
            roleId,
          },
        );

      return {
        status:
          result.workspaceMembership === 'complete' &&
          result.temporaryPasswordEmail !== 'failed_or_unknown'
            ? ProvisionWorkspaceMemberStatus.READY
            : ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        switch (error.failure) {
          case 'unavailable':
            return { status: ProvisionWorkspaceMemberStatus.UNAVAILABLE };
          case 'delivery_unavailable':
            return {
              status: ProvisionWorkspaceMemberStatus.DELIVERY_UNAVAILABLE,
            };
          case 'review_required':
            return {
              status: ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED,
            };
        }
      }

      throw new AuthException(
        'Unable to provision workspace member',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
        { userFriendlyMessage: msg`Unable to add this member right now.` },
      );
    }
  }

  @Mutation(() => ResendTemporaryPasswordResultDTO)
  async resendTemporaryPassword(
    @Args('workspaceMemberId', { type: () => UUIDScalarType })
    workspaceMemberId: string,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ResendTemporaryPasswordResultDTO> {
    await this.assertCanManageWorkspaceMembers(userWorkspaceId, workspace.id);

    const workspaceMember = await this.userWorkspaceService.getWorkspaceMember({
      workspaceMemberId,
      workspaceId: workspace.id,
    });

    if (!workspaceMember) {
      return { status: ResendTemporaryPasswordStatus.UNAVAILABLE };
    }

    const userWorkspace =
      await this.userWorkspaceService.checkUserWorkspaceExists(
        workspaceMember.userId,
        workspace.id,
      );

    if (!userWorkspace) {
      return { status: ResendTemporaryPasswordStatus.UNAVAILABLE };
    }

    const user = await this.userRepository.findOne({
      where: { id: workspaceMember.userId },
    });

    if (!user || user.disabled || !user.mustChangePassword) {
      return { status: ResendTemporaryPasswordStatus.UNAVAILABLE };
    }

    await this.throttleResend(workspace.id, user.id);

    try {
      const result =
        await this.temporaryPasswordProvisioningService.rotateTemporaryPassword(
          user.id,
        );

      return {
        status:
          result.temporaryPasswordEmail === 'sent'
            ? ResendTemporaryPasswordStatus.SENT
            : ResendTemporaryPasswordStatus.REVIEW_REQUIRED,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        switch (error.failure) {
          case 'unavailable':
            return { status: ResendTemporaryPasswordStatus.UNAVAILABLE };
          case 'delivery_unavailable':
            return {
              status: ResendTemporaryPasswordStatus.DELIVERY_UNAVAILABLE,
            };
          case 'review_required':
            return { status: ResendTemporaryPasswordStatus.REVIEW_REQUIRED };
        }
      }

      throw new AuthException(
        'Unable to resend temporary password',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
        {
          userFriendlyMessage: msg`Unable to resend sign-in instructions right now.`,
        },
      );
    }
  }

  private async assertCanManageWorkspaceMembers(
    userWorkspaceId: string,
    workspaceId: string,
  ): Promise<void> {
    const hasPermission =
      await this.permissionsService.userHasWorkspaceSettingPermission({
        userWorkspaceId,
        workspaceId,
        setting: PermissionFlagType.WORKSPACE_MEMBERS,
      });

    if (!hasPermission) {
      throw new PermissionsException(
        PermissionsExceptionMessage.PERMISSION_DENIED,
        PermissionsExceptionCode.PERMISSION_DENIED,
      );
    }
  }

  private async throttleProvisioning(
    workspaceId: string,
    email: string,
  ): Promise<void> {
    const timeWindow = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_EMAIL_THROTTLE_TTL_IN_MS',
    );
    const emailLimit = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_EMAIL_THROTTLE_LIMIT',
    );
    const workspaceLimit = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_WORKSPACE_THROTTLE_LIMIT',
    );
    const hashedEmail = createHash('sha256').update(email).digest('hex');

    await Promise.all([
      this.throttlerService.tokenBucketThrottleOrThrow(
        `${TEMPORARY_PASSWORD_PROVISIONING_THROTTLE_PREFIX}:workspace:${workspaceId}:email:${hashedEmail}`,
        1,
        emailLimit,
        timeWindow,
      ),
      this.throttlerService.tokenBucketThrottleOrThrow(
        `${TEMPORARY_PASSWORD_PROVISIONING_THROTTLE_PREFIX}:workspace:${workspaceId}:all`,
        1,
        workspaceLimit,
        timeWindow,
      ),
    ]);
  }

  private async throttleResend(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const timeWindow = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_EMAIL_THROTTLE_TTL_IN_MS',
    );
    const userLimit = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_EMAIL_THROTTLE_LIMIT',
    );
    const workspaceLimit = this.twentyConfigService.get(
      'INVITATION_SENDING_BY_WORKSPACE_THROTTLE_LIMIT',
    );

    await Promise.all([
      this.throttlerService.tokenBucketThrottleOrThrow(
        `${TEMPORARY_PASSWORD_RESEND_THROTTLE_PREFIX}:workspace:${workspaceId}:user:${userId}`,
        1,
        userLimit,
        timeWindow,
      ),
      this.throttlerService.tokenBucketThrottleOrThrow(
        `${TEMPORARY_PASSWORD_RESEND_THROTTLE_PREFIX}:workspace:${workspaceId}:all`,
        1,
        workspaceLimit,
        timeWindow,
      ),
    ]);
  }
}
