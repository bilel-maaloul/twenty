import { Logger } from '@nestjs/common';

import { QueryFailedError, Repository } from 'typeorm';
import { AppPath } from 'twenty-shared/types';

import { FirstLoginInvitationPasscodeEmail } from 'twenty-emails';
import { FirstPasswordCreationService } from 'src/engine/core-modules/auth/services/first-password-creation.service';
import { TemporaryPasswordProvisioningService } from 'src/engine/core-modules/auth/services/temporary-password-provisioning.service';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

jest.mock('twenty-emails', () => ({
  FirstLoginInvitationPasscodeEmail: jest.fn((props) => props),
  renderEmail: jest.fn(async (props) => `rendered-body:${props.passcode}`),
}));

const WORKSPACE = {
  id: 'workspace-id',
  displayName: 'Acme',
} as WorkspaceEntity;
const INVITATION = {
  passcode: '019284',
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
};

const createEmailUniqueViolation = () =>
  new QueryFailedError('INSERT INTO "core"."user"', [], {
    code: '23505',
    constraint: 'UQ_USER_EMAIL',
  } as Error & { code: string; constraint: string });

const createUser = (overrides: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'user-id',
    email: 'person@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    locale: 'en',
    disabled: false,
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    credentialEpoch: 0,
    passwordHash: null,
    permanentPasswordExpiresAt: null,
    deletedAt: null,
    ...overrides,
  }) as UserEntity;

const createHarness = () => {
  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn((values) => values),
    save: jest.fn(),
    update: jest.fn(),
  };
  const userWorkspaceService = {
    ensureUserIsInWorkspace: jest.fn().mockResolvedValue(undefined),
  };
  const emailSenderService = {
    verifySensitiveDelivery: jest.fn().mockResolvedValue(undefined),
    sendSensitive: jest.fn().mockResolvedValue(undefined),
  };
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'EMAIL_FROM_NAME') return 'Twenty';
      if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@example.com';

      throw new Error(`Unexpected config key ${key}`);
    }),
  };
  const workspaceDomainsService = {
    buildWorkspaceURL: jest.fn(
      () => new URL('https://acme.example.com/create-first-password'),
    ),
  };
  const firstPasswordCreationService = {
    restoreDeletedUserForInvitation: jest.fn(),
    issueInvitationPasscode: jest.fn().mockResolvedValue(INVITATION),
  };
  const loggerError = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation();
  const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  const service = new TemporaryPasswordProvisioningService(
    userRepository as unknown as Repository<UserEntity>,
    userWorkspaceService as unknown as UserWorkspaceService,
    emailSenderService as unknown as EmailSenderService,
    twentyConfigService as unknown as TwentyConfigService,
    workspaceDomainsService as unknown as WorkspaceDomainsService,
    firstPasswordCreationService as unknown as FirstPasswordCreationService,
  );

  return {
    service,
    userRepository,
    userWorkspaceService,
    emailSenderService,
    twentyConfigService,
    workspaceDomainsService,
    firstPasswordCreationService,
    loggerError,
    loggerWarn,
  };
};

const getEmailPasscode = (sendOptions: { text: string }): string => {
  const match = sendOptions.text.match(/^rendered-body:(\d{6})$/);

  if (!match) {
    throw new Error('Invitation passcode missing from sensitive email body');
  }

  return match[1];
};

describe('TemporaryPasswordProvisioningService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const params = {
    email: '  PERSON@example.com ',
    firstName: 'Jane',
    lastName: 'Doe',
    workspace: WORKSPACE,
    roleId: 'member-role-id',
  };

  it('creates a passwordless pending identity and sends a six-digit passcode only by sensitive SMTP', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.userRepository.save.mockImplementation(async (user) =>
      Object.assign({}, savedUser, user),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);
    const savedValues = harness.userRepository.save.mock.calls[0][0];
    const passcode = getEmailPasscode(
      harness.emailSenderService.sendSensitive.mock.calls[0][0],
    );

    expect(result).toEqual({
      userId: 'user-id',
      userWasCreated: true,
      userWasRestored: false,
      invitationEmail: 'sent',
      workspaceMembership: 'complete',
    });
    expect(savedValues).toMatchObject({
      email: 'person@example.com',
      passwordHash: null,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: null,
      permanentPasswordExpiresAt: null,
      credentialEpoch: 0,
      disabled: false,
      canAccessFullAdminPanel: false,
      canImpersonate: false,
    });
    expect(passcode).toMatch(/^\d{6}$/);
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).toHaveBeenCalledWith({ userId: savedUser.id, workspaceId: WORKSPACE.id });
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(
      harness.workspaceDomainsService.buildWorkspaceURL,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: AppPath.SignInUp,
        workspace: WORKSPACE,
      }),
    );
    expect(FirstLoginInvitationPasscodeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ passcode }),
    );
    expect(JSON.stringify(result)).not.toContain(passcode);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      passcode,
    );
    expect(harness.loggerWarn.mock.calls.flat().join(' ')).not.toContain(
      passcode,
    );
  });

  it('adds an existing active global identity to the workspace without changing credentials or sending a passcode', async () => {
    const harness = createHarness();
    const existingUser = createUser({
      mustChangePassword: false,
      credentialEpoch: 4,
      passwordHash: 'existing-password-hash',
    });

    harness.userRepository.findOne.mockResolvedValueOnce(existingUser);

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: existingUser.id,
      userWasCreated: false,
      userWasRestored: false,
      invitationEmail: 'not_sent_existing_user',
      workspaceMembership: 'complete',
    });
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledWith(existingUser, WORKSPACE, params.roleId);
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).not.toHaveBeenCalled();
  });

  it('restores the same soft-deleted identity and sends a new invitation passcode', async () => {
    const harness = createHarness();
    const deletedUser = createUser({
      id: 'deleted-user-id',
      deletedAt: new Date(),
      passwordHash: 'old-hash',
      credentialEpoch: 5,
    });
    const restoredUser = createUser({
      id: deletedUser.id,
      deletedAt: null,
      passwordHash: null,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: null,
      permanentPasswordExpiresAt: null,
      credentialEpoch: 6,
    });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(deletedUser);
    harness.firstPasswordCreationService.restoreDeletedUserForInvitation.mockResolvedValue(
      { status: 'restored', user: restoredUser },
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: deletedUser.id,
      userWasCreated: false,
      userWasRestored: true,
      invitationEmail: 'sent',
      workspaceMembership: 'complete',
    });
    expect(
      harness.firstPasswordCreationService.restoreDeletedUserForInvitation,
    ).toHaveBeenCalledWith({
      userId: deletedUser.id,
      firstName: params.firstName,
      lastName: params.lastName,
    });
    expect(harness.userRepository.create).not.toHaveBeenCalled();
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledWith(restoredUser, WORKSPACE, params.roleId);
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).toHaveBeenCalledWith({
      userId: deletedUser.id,
      workspaceId: WORKSPACE.id,
    });
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
  });

  it('does not report a restored invitation as sent when sensitive SMTP delivery fails', async () => {
    const harness = createHarness();
    const deletedUser = createUser({
      id: 'deleted-user-id',
      deletedAt: new Date(),
      passwordHash: 'old-hash',
      credentialEpoch: 5,
    });
    const restoredUser = createUser({
      id: deletedUser.id,
      deletedAt: null,
      passwordHash: null,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: null,
      permanentPasswordExpiresAt: null,
      credentialEpoch: 6,
    });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(deletedUser);
    harness.firstPasswordCreationService.restoreDeletedUserForInvitation.mockResolvedValue(
      { status: 'restored', user: restoredUser },
    );
    harness.emailSenderService.sendSensitive.mockRejectedValueOnce(
      new Error('smtp delivery failure'),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: deletedUser.id,
      userWasCreated: false,
      userWasRestored: true,
      invitationEmail: 'failed_or_unknown',
      workspaceMembership: 'complete',
    });
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).toHaveBeenCalledWith({
      userId: deletedUser.id,
      workspaceId: WORKSPACE.id,
    });
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'smtp delivery failure',
    );
  });

  it('rejects a disabled soft-deleted identity without revealing or changing it', async () => {
    const harness = createHarness();

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createUser({ deletedAt: new Date(), disabled: true }),
      );

    await expect(
      harness.service.provisionUserWithTemporaryPassword(params),
    ).rejects.toThrow('Unable to provision the user');

    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).not.toHaveBeenCalled();
    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(
      harness.firstPasswordCreationService.restoreDeletedUserForInvitation,
    ).not.toHaveBeenCalled();
    expect(harness.loggerWarn.mock.calls.flat().join(' ')).not.toContain(
      'person@example.com',
    );
  });

  it('fails SMTP preflight before creating an identity or passcode', async () => {
    const harness = createHarness();

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.emailSenderService.verifySensitiveDelivery.mockRejectedValueOnce(
      new Error('smtp-secret-password'),
    );

    await expect(
      harness.service.provisionUserWithTemporaryPassword(params),
    ).rejects.toThrow('Invitation email SMTP preflight failed');

    expect(harness.userRepository.save).not.toHaveBeenCalled();
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).not.toHaveBeenCalled();
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'smtp-secret-password',
    );
  });

  it('treats a concurrent active-user winner as existing and never emails a passcode', async () => {
    const harness = createHarness();
    const winningUser = createUser({
      id: 'winning-user-id',
      passwordHash: 'winner-hash',
      credentialEpoch: 3,
    });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winningUser);
    harness.userRepository.save.mockRejectedValueOnce(
      createEmailUniqueViolation(),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: winningUser.id,
      userWasCreated: false,
      userWasRestored: false,
      invitationEmail: 'not_sent_existing_user',
      workspaceMembership: 'complete',
    });
    expect(
      harness.userWorkspaceService.ensureUserIsInWorkspace,
    ).toHaveBeenCalledWith(winningUser, WORKSPACE, params.roleId);
    expect(harness.userRepository.update).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).not.toHaveBeenCalled();
  });

  it('returns review-required state after partial membership persistence without issuing an invitation', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.userRepository.save.mockResolvedValueOnce(savedUser);
    harness.userWorkspaceService.ensureUserIsInWorkspace.mockRejectedValueOnce(
      new Error('workspace relationship failure'),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result).toEqual({
      userId: savedUser.id,
      userWasCreated: true,
      userWasRestored: false,
      invitationEmail: 'failed_or_unknown',
      workspaceMembership: 'incomplete',
    });
    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).not.toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).not.toHaveBeenCalled();
  });

  it('sanitizes an ambiguous SMTP delivery failure without logging the passcode', async () => {
    const harness = createHarness();
    const savedUser = createUser({ mustChangePassword: true });

    harness.userRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    harness.userRepository.save.mockResolvedValueOnce(savedUser);
    harness.emailSenderService.sendSensitive.mockRejectedValueOnce(
      new Error('connection dropped after SMTP accepted body with 019284'),
    );

    const result =
      await harness.service.provisionUserWithTemporaryPassword(params);

    expect(result.invitationEmail).toBe('failed_or_unknown');
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      INVITATION.passcode,
    );
    expect(harness.loggerError.mock.calls.flat().join(' ')).not.toContain(
      'connection dropped',
    );
  });

  it('resends by issuing a new passcode through the sensitive email path only', async () => {
    const harness = createHarness();
    const pendingUser = createUser({
      mustChangePassword: true,
      passwordHash: null,
      temporaryPasswordExpiresAt: null,
    });
    harness.userRepository.findOne.mockResolvedValueOnce(pendingUser);

    await expect(
      harness.service.resendInvitationPasscode(pendingUser.id, WORKSPACE),
    ).resolves.toEqual({ invitationEmail: 'sent' });

    expect(
      harness.firstPasswordCreationService.issueInvitationPasscode,
    ).toHaveBeenCalledWith({
      userId: pendingUser.id,
      workspaceId: WORKSPACE.id,
    });
    expect(
      harness.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalled();
    expect(harness.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
    expect(
      getEmailPasscode(
        harness.emailSenderService.sendSensitive.mock.calls[0][0],
      ),
    ).toBe(INVITATION.passcode);
  });
});
