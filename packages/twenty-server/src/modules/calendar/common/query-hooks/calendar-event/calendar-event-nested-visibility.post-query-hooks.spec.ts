import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';
import {
  CalendarEventNestedFindManyVisibilityPostQueryHook,
  CalendarEventNestedFindOneVisibilityPostQueryHook,
} from 'src/modules/calendar/common/query-hooks/calendar-event/calendar-event-nested-visibility.post-query-hooks';

describe('CalendarEventNestedVisibilityPostQueryHooks', () => {
  const userAuthContext = {
    type: 'user',
    workspace: { id: 'workspace-id' },
    user: { id: 'user-id' },
    userWorkspaceId: 'user-workspace-id',
    workspaceMemberId: 'member-id',
  } as WorkspaceAuthContext;

  it('removes nested inaccessible events and redacts metadata-only events', async () => {
    const visibleEvents = new Map([
      [
        'metadata-event',
        {
          id: 'metadata-event',
          title: 'Additional permissions required',
          description: 'Additional permissions required',
        },
      ],
    ]);
    const service = {
      getVisibleCalendarEventsById: jest.fn().mockResolvedValue(visibleEvents),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventNestedFindManyVisibilityPostQueryHook(
      service,
    );
    const records = [
      {
        calendarEventTargets: [
          {
            id: 'metadata-target',
            calendarEventId: 'metadata-event',
            calendarEvent: {
              id: 'metadata-event',
              title: 'Private title',
              description: 'Private description',
            },
          },
          {
            id: 'private-target',
            calendarEventId: 'private-event',
            calendarEvent: {
              id: 'private-event',
              title: 'Private event',
            },
          },
        ],
      },
    ];

    await hook.execute(userAuthContext, 'person', records);

    expect(records[0].calendarEventTargets).toHaveLength(1);
    expect(records[0].calendarEventTargets[0].calendarEvent).toEqual({
      id: 'metadata-event',
      title: 'Additional permissions required',
      description: 'Additional permissions required',
    });
    expect(service.getVisibleCalendarEventsById).toHaveBeenCalledWith({
      eventIds: ['metadata-event', 'private-event'],
      workspaceId: 'workspace-id',
      userId: 'user-id',
      workspaceMemberId: 'member-id',
    });
  });

  it('applies the same nested restriction to findOne results', async () => {
    const service = {
      getVisibleCalendarEventsById: jest.fn().mockResolvedValue(new Map()),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventNestedFindOneVisibilityPostQueryHook(service);
    const record = {
      calendarEventParticipants: [
        { id: 'participant-id', calendarEventId: 'private-event' },
      ],
    };

    await hook.execute(userAuthContext, 'person', [record]);

    expect(record.calendarEventParticipants).toEqual([]);
  });

  it('does not change non-user authentication results', async () => {
    const service = {
      getVisibleCalendarEventsById: jest.fn(),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventNestedFindManyVisibilityPostQueryHook(
      service,
    );
    const systemAuthContext = {
      type: 'system',
      workspace: { id: 'workspace-id' },
    } as WorkspaceAuthContext;
    const records = [
      { calendarEventTargets: [{ calendarEventId: 'event-id' }] },
    ];

    await hook.execute(systemAuthContext, 'person', records);

    expect(records[0].calendarEventTargets).toHaveLength(1);
    expect(service.getVisibleCalendarEventsById).not.toHaveBeenCalled();
  });
});
