import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';

export const assertCalendarEventTargetWriteAccess = async (
  authContext: WorkspaceAuthContext,
  data: Record<string, unknown>,
  applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
): Promise<void> => {
  if (authContext.type !== 'user') {
    return;
  }

  const eventId = data.calendarEventId;

  if (typeof eventId !== 'string') {
    throw new ForbiddenError('Calendar event target access is forbidden');
  }

  const isWritable =
    await applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
      {
        eventId,
        workspaceId: authContext.workspace.id,
        userWorkspaceId: authContext.userWorkspaceId,
        workspaceMemberId: authContext.workspaceMemberId,
      },
    );

  if (!isWritable) {
    throw new ForbiddenError('Calendar event target access is forbidden');
  }
};
