import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CalendarEventComposerService } from 'src/modules/calendar/calendar-event-creation-manager/services/calendar-event-composer.service';

const ACCOUNT_ID = '20202020-1111-4111-8111-111111111111';
const WORKSPACE_ID = '20202020-2222-4222-8222-222222222222';
const OWNER_ID = '20202020-4444-4444-8444-444444444444';

const buildService = (owner: { id: string } | null = { id: OWNER_ID }) => {
  const connectedAccountRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: ACCOUNT_ID,
      provider: ConnectedAccountProvider.IMAP_SMTP_CALDAV,
      scopes: null,
    } as ConnectedAccountEntity),
  } as unknown as Repository<ConnectedAccountEntity>;
  const calendarChannelRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: '20202020-3333-4333-8333-333333333333',
      connectedAccountId: ACCOUNT_ID,
      workspaceId: WORKSPACE_ID,
      isSyncEnabled: true,
    } as CalendarChannelEntity),
  } as unknown as Repository<CalendarChannelEntity>;
  const workspaceMemberRepository = {
    findOne: jest.fn().mockResolvedValue(owner),
  };
  const workspaceOrmManager = {
    getRepository: jest.fn().mockReturnValue(workspaceMemberRepository),
  };

  return new CalendarEventComposerService(
    connectedAccountRepository,
    calendarChannelRepository,
    workspaceOrmManager as unknown as WorkspaceOrmManager,
  );
};

const baseInput = {
  connectedAccountId: ACCOUNT_ID,
  title: 'Planning session',
  startsAt: '2026-07-01T14:00:00Z',
  endsAt: '2026-07-01T15:00:00Z',
  isFullDay: false,
  timeZone: 'UTC',
  sendInvitations: false,
};

describe('CalendarEventComposerService', () => {
  it('normalizes calendar metadata for a valid event', async () => {
    const result = await buildService().composeCalendarEvent(
      {
        ...baseInput,
        eventType: 'CALL',
        ownerId: OWNER_ID,
        reminderMinutesBefore: 15,
        recurrenceFrequency: 'WEEKLY',
        recurrenceOccurrences: 4,
      },
      WORKSPACE_ID,
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        input: expect.objectContaining({
          eventType: 'CALL',
          ownerId: OWNER_ID,
          reminderMinutesBefore: 15,
          recurrenceFrequency: 'WEEKLY',
          recurrenceOccurrences: 4,
        }),
      },
    });
  });

  it('rejects recurring events without a boundary', async () => {
    const result = await buildService().composeCalendarEvent(
      { ...baseInput, recurrenceFrequency: 'DAILY' },
      WORKSPACE_ID,
    );

    expect(result).toEqual({
      success: false,
      error:
        'A recurring event needs a recurrence end date or occurrence count',
    });
  });

  it('rejects unsupported reminder values', async () => {
    const result = await buildService().composeCalendarEvent(
      { ...baseInput, reminderMinutesBefore: 10 },
      WORKSPACE_ID,
    );

    expect(result).toEqual({
      success: false,
      error: 'reminderMinutesBefore must be one of 0, 5, 15, 30, 60 or 1440',
    });
  });

  it('rejects an owner from another workspace', async () => {
    const result = await buildService(null).composeCalendarEvent(
      { ...baseInput, ownerId: OWNER_ID },
      WORKSPACE_ID,
    );

    expect(result).toEqual({
      success: false,
      error: 'ownerId does not belong to this workspace',
    });
  });
});
