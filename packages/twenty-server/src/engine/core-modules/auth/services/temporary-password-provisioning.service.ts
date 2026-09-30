import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type SendMailOptions } from 'nodemailer';
import { QueryFailedError, Repository } from 'typeorm';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { AppPath } from 'twenty-shared/types';

import { FirstLoginInvitationPasscodeEmail, renderEmail } from 'twenty-emails';
import {
  FirstPasswordCreationService,
  type DeletedUserInvitationRestoreResult,
} from 'src/engine/core-modules/auth/services/first-password-creation.service';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { POSTGRESQL_ERROR_CODES } from 'src/engine/api/graphql/workspace-query-runner/constants/postgres-error-codes.constants';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

type ProvisionUserWithTemporaryPasswordParams = {
  email: string;
  firstName: string;
  lastName: string;
  workspace: WorkspaceEntity;
  roleId?: string | null;
  locale?: UserEntity['locale'];
};

type ProvisioningResult = {
  userId: string;
  userWasCreated: boolean;
  userWasRestored: boolean;
  invitationEmail: 'sent' | 'failed_or_unknown' | 'not_sent_existing_user';
  workspaceMembership: 'complete' | 'incomplete';
};

type InvitationPasscodeDeliveryResult = {
  invitationEmail: 'sent' | 'failed_or_unknown';
};

export type TemporaryPasswordProvisioningFailure =
  | 'unavailable'
  | 'delivery_unavailable'
  | 'review_required';

export class TemporaryPasswordProvisioningException extends Error {
  constructor(
    readonly failure: TemporaryPasswordProvisioningFailure,
    message: string,
  ) {
    super(message);
  }
}

const GENERIC_PROVISIONING_ERROR = 'Unable to provision the user';
const GENERIC_ROTATION_ERROR = 'Unable to resend the member invitation';
const USER_EMAIL_UNIQUE_CONSTRAINT = 'UQ_USER_EMAIL';

const isUserEmailUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error as QueryFailedError & { code?: string; constraint?: string }).code ===
    POSTGRESQL_ERROR_CODES.UNIQUE_VIOLATION &&
  (error as QueryFailedError & { constraint?: string }).constraint ===
    USER_EMAIL_UNIQUE_CONSTRAINT;

@Injectable()
export class TemporaryPasswordProvisioningService {
  private readonly logger = new Logger(
    TemporaryPasswordProvisioningService.name,
  );

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly emailSenderService: EmailSenderService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
    private readonly firstPasswordCreationService: FirstPasswordCreationService,
  ) {}

  async provisionUserWithTemporaryPassword({
    email,
    firstName,
    lastName,
    workspace,
    roleId,
    locale,
  }: ProvisionUserWithTemporaryPasswordParams): Promise<ProvisioningResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return this.addExistingUserToWorkspace(existingUser, workspace, roleId);
    }

    const historicalIdentity = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      withDeleted: true,
    });

    if (historicalIdentity?.deletedAt) {
      if (
        historicalIdentity.disabled ||
        historicalIdentity.canAccessFullAdminPanel ||
        historicalIdentity.canImpersonate
      ) {
        this.logger.warn(
          'Member invitation rejected a non-restorable identity',
        );
        throw new TemporaryPasswordProvisioningException(
          'unavailable',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      await this.preflightSensitiveDelivery();

      let restoration: DeletedUserInvitationRestoreResult;

      try {
        restoration =
          await this.firstPasswordCreationService.restoreDeletedUserForInvitation(
            {
              userId: historicalIdentity.id,
              firstName,
              lastName,
            },
          );
      } catch (error) {
        if (isUserEmailUniqueViolation(error)) {
          let concurrentActiveUser: UserEntity | null;

          try {
            concurrentActiveUser = await this.findActiveUser(normalizedEmail);
          } catch {
            throw new TemporaryPasswordProvisioningException(
              'review_required',
              GENERIC_PROVISIONING_ERROR,
            );
          }

          if (concurrentActiveUser) {
            return this.addExistingUserToWorkspace(
              concurrentActiveUser,
              workspace,
              roleId,
            );
          }
        }

        this.logger.error('Deleted member restoration needs review');
        throw new TemporaryPasswordProvisioningException(
          'review_required',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      if (restoration.status === 'unavailable') {
        throw new TemporaryPasswordProvisioningException(
          'unavailable',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      if (restoration.status === 'already_active') {
        return this.addExistingUserToWorkspace(
          restoration.user,
          workspace,
          roleId,
        );
      }

      return this.inviteRestoredUser(restoration.user, workspace, roleId);
    }

    if (historicalIdentity) {
      return this.addExistingUserToWorkspace(
        historicalIdentity,
        workspace,
        roleId,
      );
    }

    await this.preflightSensitiveDelivery();

    let passcode: string | undefined;

    try {
      const user = this.userRepository.create({
        email: normalizedEmail,
        firstName,
        lastName,
        locale: locale ?? SOURCE_LOCALE,
        passwordHash: null,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: null,
        permanentPasswordExpiresAt: null,
        credentialEpoch: 0,
        disabled: false,
        canAccessFullAdminPanel: false,
        canImpersonate: false,
      });

      let savedUser: UserEntity;

      try {
        savedUser = await this.userRepository.save(user);
      } catch (error) {
        if (!isUserEmailUniqueViolation(error)) {
          throw new TemporaryPasswordProvisioningException(
            'review_required',
            GENERIC_PROVISIONING_ERROR,
          );
        }

        let concurrentActiveUser: UserEntity | null;

        try {
          concurrentActiveUser = await this.findActiveUser(normalizedEmail);
        } catch {
          throw new TemporaryPasswordProvisioningException(
            'review_required',
            GENERIC_PROVISIONING_ERROR,
          );
        }

        if (concurrentActiveUser) {
          return this.addExistingUserToWorkspace(
            concurrentActiveUser,
            workspace,
            roleId,
          );
        }

        throw new TemporaryPasswordProvisioningException(
          'review_required',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      const workspaceMembership = await this.reconcileWorkspaceMembership(
        savedUser,
        workspace,
        roleId,
      );
      if (workspaceMembership !== 'complete') {
        return {
          userId: savedUser.id,
          userWasCreated: true,
          userWasRestored: false,
          invitationEmail: 'failed_or_unknown',
          workspaceMembership,
        };
      }

      const invitation =
        await this.firstPasswordCreationService.issueInvitationPasscode({
          userId: savedUser.id,
          workspaceId: workspace.id,
        });
      passcode = invitation.passcode;
      const deliveryStatus = await this.sendInvitationPasscodeEmail(
        savedUser,
        workspace,
        passcode,
        invitation.expiresAt,
      );

      return {
        userId: savedUser.id,
        userWasCreated: true,
        userWasRestored: false,
        invitationEmail: deliveryStatus,
        workspaceMembership,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        throw error;
      }

      this.logger.error('Member invitation provisioning failed');
      throw new Error(GENERIC_PROVISIONING_ERROR);
    } finally {
      passcode = undefined;
    }
  }

  async resendInvitationPasscode(
    userId: string,
    workspace: WorkspaceEntity,
  ): Promise<InvitationPasscodeDeliveryResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (
      !user ||
      user.disabled ||
      !user.mustChangePassword ||
      user.passwordHash ||
      user.temporaryPasswordExpiresAt
    ) {
      throw new TemporaryPasswordProvisioningException(
        'unavailable',
        GENERIC_ROTATION_ERROR,
      );
    }

    await this.preflightSensitiveDelivery();

    let passcode: string | undefined;

    try {
      const invitation =
        await this.firstPasswordCreationService.issueInvitationPasscode({
          userId: user.id,
          workspaceId: workspace.id,
        });
      passcode = invitation.passcode;
      const invitationEmail = await this.sendInvitationPasscodeEmail(
        user,
        workspace,
        passcode,
        invitation.expiresAt,
      );

      return { invitationEmail };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        throw error;
      }

      this.logger.error('Member invitation resend failed');
      throw new TemporaryPasswordProvisioningException(
        'review_required',
        GENERIC_ROTATION_ERROR,
      );
    } finally {
      passcode = undefined;
    }
  }

  private async preflightSensitiveDelivery(): Promise<void> {
    try {
      await this.emailSenderService.verifySensitiveDelivery();
    } catch {
      this.logger.error('Invitation passcode SMTP preflight failed');
      throw new TemporaryPasswordProvisioningException(
        'delivery_unavailable',
        'Invitation email SMTP preflight failed',
      );
    }
  }

  private async reconcileWorkspaceMembership(
    user: UserEntity,
    workspace: WorkspaceEntity,
    roleId?: string | null,
  ): Promise<'complete' | 'incomplete'> {
    try {
      await this.userWorkspaceService.ensureUserIsInWorkspace(
        user,
        workspace,
        roleId,
      );

      return 'complete';
    } catch {
      this.logger.error('Workspace membership reconciliation is incomplete');

      return 'incomplete';
    }
  }

  private async addExistingUserToWorkspace(
    user: UserEntity,
    workspace: WorkspaceEntity,
    roleId?: string | null,
  ): Promise<ProvisioningResult> {
    if (user.disabled) {
      this.logger.warn('Member invitation rejected a disabled identity');
      throw new TemporaryPasswordProvisioningException(
        'unavailable',
        GENERIC_PROVISIONING_ERROR,
      );
    }

    const workspaceMembership = await this.reconcileWorkspaceMembership(
      user,
      workspace,
      roleId,
    );

    return {
      userId: user.id,
      userWasCreated: false,
      userWasRestored: false,
      invitationEmail: 'not_sent_existing_user',
      workspaceMembership,
    };
  }

  private async inviteRestoredUser(
    user: UserEntity,
    workspace: WorkspaceEntity,
    roleId?: string | null,
  ): Promise<ProvisioningResult> {
    const workspaceMembership = await this.reconcileWorkspaceMembership(
      user,
      workspace,
      roleId,
    );

    if (workspaceMembership !== 'complete') {
      return {
        userId: user.id,
        userWasCreated: false,
        userWasRestored: true,
        invitationEmail: 'failed_or_unknown',
        workspaceMembership,
      };
    }

    let passcode: string | undefined;

    try {
      const invitation =
        await this.firstPasswordCreationService.issueInvitationPasscode({
          userId: user.id,
          workspaceId: workspace.id,
        });
      passcode = invitation.passcode;
      const invitationEmail = await this.sendInvitationPasscodeEmail(
        user,
        workspace,
        passcode,
        invitation.expiresAt,
      );

      return {
        userId: user.id,
        userWasCreated: false,
        userWasRestored: true,
        invitationEmail,
        workspaceMembership,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        throw error;
      }

      this.logger.error('Restored member invitation failed');
      throw new TemporaryPasswordProvisioningException(
        'review_required',
        GENERIC_PROVISIONING_ERROR,
      );
    } finally {
      passcode = undefined;
    }
  }

  private async findActiveUser(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  private async sendInvitationPasscodeEmail(
    user: UserEntity,
    workspace: WorkspaceEntity,
    passcode: string,
    expiresAt: Date,
  ): Promise<'sent' | 'failed_or_unknown'> {
    try {
      const invitationUrl = this.workspaceDomainsService.buildWorkspaceURL({
        workspace,
        pathname: AppPath.SignInUp,
      });
      const emailTemplate = FirstLoginInvitationPasscodeEmail({
        email: user.email,
        workspaceName: workspace.displayName ?? 'SIMPLE',
        userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        passcode,
        expiresAt,
        link: invitationUrl.toString(),
        locale: user.locale ?? SOURCE_LOCALE,
      });
      const html = await renderEmail(emailTemplate, { pretty: true });
      const text = await renderEmail(emailTemplate, { plainText: true });
      const sendMailOptions: SendMailOptions = {
        from: `${this.twentyConfigService.get('EMAIL_FROM_NAME')} <${this.twentyConfigService.get('EMAIL_FROM_ADDRESS')}>`,
        to: user.email,
        subject: 'Your invitation to SIMPLE',
        html,
        text,
      };

      await this.emailSenderService.sendSensitive(sendMailOptions);

      return 'sent';
    } catch {
      this.logger.error(
        'Invitation passcode email delivery failed or is unknown',
      );

      return 'failed_or_unknown';
    }
  }
}
