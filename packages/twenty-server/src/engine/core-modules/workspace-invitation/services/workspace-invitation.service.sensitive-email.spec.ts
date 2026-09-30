jest.mock('twenty-emails', () => ({
  SendInviteLinkEmail: jest.fn(() => null),
  renderEmail: jest.fn().mockResolvedValue('rendered invitation body'),
}));

import {
  AppTokenType,
  type AppTokenEntity,
} from 'src/engine/core-modules/app-token/app-token.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

const createService = (preflight = jest.fn().mockResolvedValue(undefined)) => {
  const appTokenRepository = {
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const emailSenderService = {
    verifySensitiveDelivery: preflight,
    sendSensitive: jest.fn().mockResolvedValue(undefined),
  };
  const service = Object.assign(
    Object.create(WorkspaceInvitationService.prototype),
    {
      appTokenRepository,
      emailSenderService,
      roleValidationService: {
        validateRoleAssignableToUsersOrThrow: jest.fn(),
      },
      twentyConfigService: {
        get: jest.fn((key: string) => {
          if (key === 'IS_BILLING_ENABLED') return false;
          if (key === 'EMAIL_FROM_ADDRESS') return 'no-reply@example.com';
          if (key === 'INVITATION_TOKEN_EXPIRES_IN') return '1h';

          return 10;
        }),
      },
      onboardingService: {
        completeOnboardingInviteTeamStep: jest.fn(),
      },
      workspaceDomainsService: {
        buildWorkspaceURL: jest.fn(() => new URL('https://crm.example.test/')),
      },
      i18nService: {
        getI18nInstance: jest.fn(() => ({ _: jest.fn(() => 'Join the team') })),
      },
      throttlerService: {
        tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(undefined),
      },
      fileUrlService: {
        signFileByIdUrl: jest.fn(),
      },
    },
  ) as WorkspaceInvitationService;

  return { service, appTokenRepository, emailSenderService };
};

const workspace = {
  id: 'workspace-id',
  inviteHash: 'workspace-invite-hash',
  displayName: 'Example workspace',
} as WorkspaceEntity;

const sender = {
  userId: 'sender-id',
  userEmail: 'sender@example.com',
  name: { firstName: 'Team', lastName: 'Admin' },
  locale: 'en',
} as WorkspaceMemberWorkspaceEntity;

const invitationToken = {
  id: 'invitation-token-id',
  type: AppTokenType.InvitationToken,
  value: 'opaque-invitation-token',
  expiresAt: new Date(Date.now() + 60_000),
  context: { email: 'invitee@example.com' },
};

describe('WorkspaceInvitationService sensitive email delivery', () => {
  it('preflights SMTP before replacing or creating invitation tokens', async () => {
    const preflight = jest
      .fn()
      .mockRejectedValue(new Error('Sensitive email SMTP preflight failed'));
    const scenario = createService(preflight);
    const createInvitation = jest
      .spyOn(scenario.service, 'createWorkspaceInvitation')
      .mockResolvedValue(invitationToken as AppTokenEntity);

    await expect(
      scenario.service.sendInvitations({
        emails: ['invitee@example.com'],
        workspace,
        sender,
        appTokenIdToInvalidate: 'old-invitation-token-id',
      }),
    ).rejects.toThrow('Sensitive email SMTP preflight failed');

    expect(preflight).toHaveBeenCalledTimes(1);
    expect(scenario.appTokenRepository.delete).not.toHaveBeenCalled();
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('sends invitation links only through the sensitive SMTP path', async () => {
    const scenario = createService();
    jest
      .spyOn(scenario.service, 'createWorkspaceInvitation')
      .mockResolvedValue(invitationToken as AppTokenEntity);

    await scenario.service.sendInvitations({
      emails: ['invitee@example.com'],
      workspace,
      sender,
    });

    expect(
      scenario.emailSenderService.verifySensitiveDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(scenario.emailSenderService.sendSensitive).toHaveBeenCalledTimes(1);
  });
});
