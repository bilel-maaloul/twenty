import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { CalendarEventTargetCreateManyPreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event-target/calendar-event-target-create-many.pre-query-hook';
import { CalendarEventTargetCreateOnePreQueryHook } from 'src/modules/calendar/common/query-hooks/calendar-event-target/calendar-event-target-create-one.pre-query-hook';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';

describe('CalendarEventTargetCreatePreQueryHooks', () => {
  const userAuthContext = {
    type: 'user',
    workspace: { id: 'workspace-id' },
    userWorkspaceId: 'user-workspace-id',
    workspaceMemberId: 'member-id',
  } as WorkspaceAuthContext;

  it('allows adding targets only to events the current member can write', async () => {
    const service = {
      canUserWriteCalendarEvent: jest.fn().mockResolvedValue(true),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventTargetCreateOnePreQueryHook(service);

    await expect(
      hook.execute(userAuthContext, 'calendarEventTarget', {
        data: { calendarEventId: 'event-id', targetPersonId: 'person-id' },
      }),
    ).resolves.toEqual({
      data: {
        calendarEventId: 'event-id',
        targetPersonId: 'person-id',
        isManuallyAssigned: true,
      },
    });

    expect(service.canUserWriteCalendarEvent).toHaveBeenCalledWith({
      eventId: 'event-id',
      workspaceId: 'workspace-id',
      userWorkspaceId: 'user-workspace-id',
      workspaceMemberId: 'member-id',
    });
  });

  it('rejects target updates for events outside the current member’s write scope', async () => {
    const service = {
      canUserWriteCalendarEvent: jest.fn().mockResolvedValue(false),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventTargetCreateManyPreQueryHook(service);

    await expect(
      hook.execute(userAuthContext, 'calendarEventTarget', {
        data: [{ calendarEventId: 'event-id', targetPersonId: 'person-id' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('keeps non-user target creation unchanged', async () => {
    const service = {
      canUserWriteCalendarEvent: jest.fn(),
    } as unknown as ApplyCalendarEventsVisibilityRestrictionsService;
    const hook = new CalendarEventTargetCreateManyPreQueryHook(service);
    const systemAuthContext = {
      type: 'system',
      workspace: { id: 'workspace-id' },
    } as WorkspaceAuthContext;

    await expect(
      hook.execute(systemAuthContext, 'calendarEventTarget', {
        data: [{ calendarEventId: 'event-id', targetPersonId: 'person-id' }],
      }),
    ).resolves.toEqual({
      data: [
        {
          calendarEventId: 'event-id',
          targetPersonId: 'person-id',
          isManuallyAssigned: true,
        },
      ],
    });

    expect(service.canUserWriteCalendarEvent).not.toHaveBeenCalled();
  });
});
