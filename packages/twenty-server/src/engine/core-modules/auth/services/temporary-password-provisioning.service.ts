import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { randomBytes } from 'node:crypto';
import { addMilliseconds } from 'date-fns';
import ms from 'ms';
import { type SendMailOptions } from 'nodemailer';
import { QueryFailedError, Repository } from 'typeorm';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import {
  AdministratorTemporaryPasswordEmail,
  renderEmail,
} from 'twenty-emails';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import {
  hashPassword,
  PASSWORD_REGEX,
} from 'src/engine/core-modules/auth/auth.util';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
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
  temporaryPasswordEmail:
    | 'sent'
    | 'failed_or_unknown'
    | 'not_sent_existing_user';
  workspaceMembership: 'complete' | 'incomplete';
};

type TemporaryPasswordRotationResult = {
  userId: string;
  credentialEpoch: number;
  temporaryPasswordEmail: 'sent' | 'failed_or_unknown';
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
const GENERIC_ROTATION_ERROR = 'Unable to rotate the temporary password';
const ROTATION_OUTCOME_UNKNOWN_ERROR =
  'Temporary-password rotation outcome is unknown';
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
    private readonly authService: AuthService,
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
      if (existingUser.disabled) {
        this.logger.warn(
          'Temporary-password provisioning rejected a disabled identity',
        );
        throw new TemporaryPasswordProvisioningException(
          'unavailable',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      const workspaceMembership = await this.reconcileWorkspaceMembership(
        existingUser,
        workspace,
        roleId,
      );

      return {
        userId: existingUser.id,
        userWasCreated: false,
        temporaryPasswordEmail: 'not_sent_existing_user',
        workspaceMembership,
      };
    }

    const historicalIdentity = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      withDeleted: true,
    });

    if (historicalIdentity?.deletedAt) {
      this.logger.warn(
        'Temporary-password provisioning rejected a deleted identity',
      );
      throw new TemporaryPasswordProvisioningException(
        'unavailable',
        GENERIC_PROVISIONING_ERROR,
      );
    }

    await this.preflightSensitiveDelivery();

    let temporaryPassword: string | undefined;

    try {
      temporaryPassword = this.generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = this.getTemporaryPasswordExpiration();
      const user = this.userRepository.create({
        email: normalizedEmail,
        firstName,
        lastName,
        locale: locale ?? SOURCE_LOCALE,
        passwordHash,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
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
          if (concurrentActiveUser.disabled) {
            this.logger.warn(
              'Temporary-password provisioning rejected a disabled identity',
            );
            throw new TemporaryPasswordProvisioningException(
              'unavailable',
              GENERIC_PROVISIONING_ERROR,
            );
          }

          const workspaceMembership = await this.reconcileWorkspaceMembership(
            concurrentActiveUser,
            workspace,
            roleId,
          );

          return {
            userId: concurrentActiveUser.id,
            userWasCreated: false,
            temporaryPasswordEmail: 'not_sent_existing_user',
            workspaceMembership,
          };
        }

        throw new TemporaryPasswordProvisioningException(
          'review_required',
          GENERIC_PROVISIONING_ERROR,
        );
      }

      const deliveryStatus = await this.sendTemporaryPasswordEmail(
        savedUser,
        temporaryPassword,
        expiresAt,
      );
      const workspaceMembership = await this.reconcileWorkspaceMembership(
        savedUser,
        workspace,
        roleId,
      );

      return {
        userId: savedUser.id,
        userWasCreated: true,
        temporaryPasswordEmail: deliveryStatus,
        workspaceMembership,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        throw error;
      }

      this.logger.error('Temporary-password provisioning failed');
      throw new Error(GENERIC_PROVISIONING_ERROR);
    } finally {
      temporaryPassword = undefined;
    }
  }

  async rotateTemporaryPassword(
    userId: string,
  ): Promise<TemporaryPasswordRotationResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || user.disabled || !user.mustChangePassword) {
      throw new TemporaryPasswordProvisioningException(
        'unavailable',
        GENERIC_ROTATION_ERROR,
      );
    }

    await this.preflightSensitiveDelivery();

    let temporaryPassword: string | undefined;

    try {
      temporaryPassword = this.generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const expiresAt = this.getTemporaryPasswordExpiration();
      const nextCredentialEpoch = user.credentialEpoch + 1;
      let credentialUpdateCommitted = false;

      try {
        const updateResult = await this.userRepository.update(
          {
            id: user.id,
            credentialEpoch: user.credentialEpoch,
            mustChangePassword: true,
            disabled: false,
          },
          {
            passwordHash,
            mustChangePassword: true,
            temporaryPasswordExpiresAt: expiresAt,
            credentialEpoch: () => '"credentialEpoch" + 1',
          },
        );
        credentialUpdateCommitted = updateResult.affected === 1;
      } catch {
        let authoritativeUser: UserEntity | null;

        try {
          authoritativeUser = await this.userRepository.findOne({
            where: { id: user.id },
          });
        } catch {
          throw new TemporaryPasswordProvisioningException(
            'review_required',
            ROTATION_OUTCOME_UNKNOWN_ERROR,
          );
        }

        if (
          authoritativeUser?.credentialEpoch === nextCredentialEpoch &&
          authoritativeUser.passwordHash === passwordHash &&
          authoritativeUser.mustChangePassword
        ) {
          credentialUpdateCommitted = true;
        } else if (
          !authoritativeUser ||
          authoritativeUser.credentialEpoch > user.credentialEpoch
        ) {
          throw new TemporaryPasswordProvisioningException(
            'review_required',
            ROTATION_OUTCOME_UNKNOWN_ERROR,
          );
        } else {
          throw new TemporaryPasswordProvisioningException(
            'review_required',
            GENERIC_ROTATION_ERROR,
          );
        }
      }

      if (!credentialUpdateCommitted) {
        throw new TemporaryPasswordProvisioningException(
          'review_required',
          GENERIC_ROTATION_ERROR,
        );
      }

      await this.authService.invalidateCredentialsAfterPasswordChange(user.id);

      const deliveryStatus = await this.sendTemporaryPasswordEmail(
        user,
        temporaryPassword,
        expiresAt,
      );

      return {
        userId: user.id,
        credentialEpoch: nextCredentialEpoch,
        temporaryPasswordEmail: deliveryStatus,
      };
    } catch (error) {
      if (error instanceof TemporaryPasswordProvisioningException) {
        throw error;
      }

      this.logger.error('Temporary-password rotation failed');
      throw new TemporaryPasswordProvisioningException(
        'review_required',
        GENERIC_ROTATION_ERROR,
      );
    } finally {
      temporaryPassword = undefined;
    }
  }

  private generateTemporaryPassword(): string {
    const password = randomBytes(32).toString('base64url');

    if (!PASSWORD_REGEX.test(password)) {
      throw new Error(
        'Generated temporary password does not meet password policy',
      );
    }

    return password;
  }

  private async preflightSensitiveDelivery(): Promise<void> {
    try {
      await this.emailSenderService.verifySensitiveDelivery();
    } catch {
      this.logger.error('Temporary-password SMTP preflight failed');
      throw new TemporaryPasswordProvisioningException(
        'delivery_unavailable',
        'Sensitive email SMTP preflight failed',
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

  private getTemporaryPasswordExpiration(): Date {
    const expiresIn = this.twentyConfigService.get(
      'TEMPORARY_PASSWORD_EXPIRES_IN',
    );
    const expiresInMilliseconds = ms(expiresIn);

    if (!expiresInMilliseconds || expiresInMilliseconds <= 0) {
      throw new Error('Temporary password expiration is invalid');
    }

    return addMilliseconds(new Date(), expiresInMilliseconds);
  }

  private async findActiveUser(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  private async sendTemporaryPasswordEmail(
    user: UserEntity,
    temporaryPassword: string,
    expiresAt: Date,
  ): Promise<'sent' | 'failed_or_unknown'> {
    try {
      const emailTemplate = AdministratorTemporaryPasswordEmail({
        email: user.email,
        userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
        temporaryPassword,
        expiresAt,
        locale: user.locale ?? SOURCE_LOCALE,
      });
      const html = await renderEmail(emailTemplate, { pretty: true });
      const text = await renderEmail(emailTemplate, { plainText: true });
      const sendMailOptions: SendMailOptions = {
        from: `${this.twentyConfigService.get('EMAIL_FROM_NAME')} <${this.twentyConfigService.get('EMAIL_FROM_ADDRESS')}>`,
        to: user.email,
        subject: 'Your temporary Twenty password',
        html,
        text,
      };

      await this.emailSenderService.sendSensitive(sendMailOptions);

      return 'sent';
    } catch {
      this.logger.error(
        'Temporary-password email delivery failed or is unknown',
      );

      return 'failed_or_unknown';
    }
  }
}
