import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { CalendarChannelVisibility } from 'twenty-shared/types';

import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

describe('ApplyCalendarEventsVisibilityRestrictionsService', () => {
  const associationRepository = { find: jest.fn() };
  const calendarEventRepository = { findOne: jest.fn() };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn((objectName: string) =>
      objectName === 'calendarEvent'
        ? calendarEventRepository
        : associationRepository,
    ),
  };
  const connectedAccountRepository = { find: jest.fn() };
  const userWorkspaceRepository = { findOne: jest.fn() };
  const calendarChannelRepository = { find: jest.fn() };
  const service = new ApplyCalendarEventsVisibilityRestrictionsService(
    workspaceOrmManager as never,
    connectedAccountRepository as never,
    userWorkspaceRepository as never,
    calendarChannelRepository as never,
  );

  const createEvent = (id = 'event-id') =>
    ({
      id,
      title: 'Planning meeting',
      description: 'Private discussion',
    }) as CalendarEventWorkspaceEntity;

  beforeEach(() => {
    jest.clearAllMocks();
    associationRepository.find.mockResolvedValue([
      { calendarEventId: 'event-id', calendarChannelId: 'channel-id' },
    ]);
    calendarChannelRepository.find.mockResolvedValue([
      {
        id: 'channel-id',
        visibility: CalendarChannelVisibility.METADATA,
      },
    ]);
    userWorkspaceRepository.findOne.mockResolvedValue({ id: 'member-id' });
    connectedAccountRepository.find.mockResolvedValue([]);
    calendarEventRepository.findOne.mockResolvedValue({
      id: 'event-id',
      ownerId: null,
    });
  });

  it('keeps full details for the workspace member who owns the connected account', async () => {
    connectedAccountRepository.find.mockResolvedValueOnce([{ id: 'account' }]);
    const event = createEvent();

    await expect(
      service.applyCalendarEventsVisibilityRestrictions(
        [event],
        'workspace-id',
        'user-id',
      ),
    ).resolves.toEqual([event]);

    expect(connectedAccountRepository.find).toHaveBeenCalledWith({
      where: {
        calendarChannels: { id: expect.anything() },
        userWorkspaceId: 'member-id',
        workspaceId: 'workspace-id',
      },
    });
  });

  it('keeps explicitly shared events visible to workspace members', async () => {
    calendarChannelRepository.find.mockResolvedValueOnce([
      {
        id: 'channel-id',
        visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
      },
    ]);
    const event = createEvent();

    await expect(
      service.applyCalendarEventsVisibilityRestrictions(
        [event],
        'workspace-id',
        'other-user-id',
      ),
    ).resolves.toEqual([event]);

    expect(connectedAccountRepository.find).not.toHaveBeenCalled();
  });

  it('redacts event details shared with metadata visibility', async () => {
    const event = createEvent();

    const visibleEvents =
      await service.applyCalendarEventsVisibilityRestrictions(
        [event],
        'workspace-id',
        'other-user-id',
      );

    expect(visibleEvents).toHaveLength(1);
    expect(visibleEvents[0]).toMatchObject({
      title: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      description: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
    });
  });

  it('removes events that are neither owned nor shared through a visible channel', async () => {
    associationRepository.find.mockResolvedValueOnce([]);
    const event = createEvent();

    await expect(
      service.applyCalendarEventsVisibilityRestrictions(
        [event],
        'workspace-id',
        'other-user-id',
      ),
    ).resolves.toEqual([]);
  });

  it('retains an event owned by the current workspace member', async () => {
    const event = { ...createEvent(), ownerId: 'member-id' };

    await expect(
      service.applyCalendarEventsVisibilityRestrictions(
        [event],
        'workspace-id',
        'other-user-id',
        'member-id',
      ),
    ).resolves.toEqual([event]);

    expect(connectedAccountRepository.find).not.toHaveBeenCalled();
  });

  it('builds a pre-query filter for the user owner and visible channels', async () => {
    calendarChannelRepository.find.mockResolvedValueOnce([
      { id: 'shared-channel' },
    ]);
    connectedAccountRepository.find.mockResolvedValueOnce([
      { calendarChannels: [{ id: 'owned-channel' }] },
    ]);
    const existingFilter = { title: { ilike: '%planning%' } };

    await expect(
      service.buildUserAccessFilter({
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
        existingFilter,
      }),
    ).resolves.toEqual({
      and: [
        existingFilter,
        {
          or: [
            { ownerId: { eq: 'member-id' } },
            {
              calendarChannelEventAssociations: {
                calendarChannelId: {
                  in: ['shared-channel', 'owned-channel'],
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('allows a user to update an event they own', async () => {
    calendarEventRepository.findOne.mockResolvedValueOnce({
      id: 'event-id',
      ownerId: 'member-id',
    });

    await expect(
      service.canUserWriteCalendarEvent({
        eventId: 'event-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
      }),
    ).resolves.toBe(true);

    expect(associationRepository.find).not.toHaveBeenCalled();
  });

  it('denies writes to another member’s event without a writable channel', async () => {
    calendarChannelRepository.find.mockResolvedValueOnce([]);
    calendarEventRepository.findOne.mockResolvedValueOnce({
      id: 'event-id',
      ownerId: 'other-member-id',
    });

    await expect(
      service.canUserWriteCalendarEvent({
        eventId: 'event-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
      }),
    ).resolves.toBe(false);

    expect(associationRepository.find).not.toHaveBeenCalled();
  });

  it('does not grant write access based only on workspace channel visibility', async () => {
    calendarChannelRepository.find.mockResolvedValueOnce([
      { id: 'shared-channel' },
    ]);
    calendarEventRepository.findOne.mockResolvedValueOnce({
      id: 'event-id',
      ownerId: 'other-member-id',
    });

    await expect(
      service.canUserWriteCalendarEvent({
        eventId: 'event-id',
        workspaceId: 'workspace-id',
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
      }),
    ).resolves.toBe(false);

    expect(associationRepository.find).not.toHaveBeenCalled();
  });
});
