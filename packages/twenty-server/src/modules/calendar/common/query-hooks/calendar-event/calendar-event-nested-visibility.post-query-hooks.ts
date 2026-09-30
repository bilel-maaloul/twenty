import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type QueryResultFieldValue } from 'src/engine/api/graphql/workspace-query-runner/factories/query-result-getters/interfaces/query-result-field-value';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';

const CALENDAR_EVENT_COLLECTION_KEYS = new Set([
  'calendarEventTargets',
  'calendarEventParticipants',
  'calendarChannelEventAssociations',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectNestedCalendarEventIds = (
  value: unknown,
  eventIds: Set<string>,
  visited: WeakSet<object>,
) => {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectNestedCalendarEventIds(child, eventIds, visited);
    }

    return;
  }

  if (!isRecord(value) || visited.has(value)) {
    return;
  }

  visited.add(value);

  if (typeof value.calendarEventId === 'string') {
    eventIds.add(value.calendarEventId);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'calendarEvent' && isRecord(child)) {
      if (typeof child.id === 'string') {
        eventIds.add(child.id);
      }
    }

    collectNestedCalendarEventIds(child, eventIds, visited);
  }
};

const sanitizeNestedCalendarEvents = (
  value: unknown,
  visibleEvents: Map<
    string,
    { id: string; title: string | null; description: string | null }
  >,
  visited: WeakSet<object>,
) => {
  if (Array.isArray(value)) {
    for (const child of value) {
      sanitizeNestedCalendarEvents(child, visibleEvents, visited);
    }

    return;
  }

  if (!isRecord(value) || visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (key === 'calendarEvent') {
      if (!isRecord(child) || typeof child.id !== 'string') {
        value[key] = null;
        continue;
      }

      const visibleEvent = visibleEvents.get(child.id);

      if (!visibleEvent) {
        value[key] = null;
        continue;
      }

      if (Object.hasOwn(child, 'title')) {
        child.title = visibleEvent.title;
      }

      if (Object.hasOwn(child, 'description')) {
        child.description = visibleEvent.description;
      }
    }

    if (CALENDAR_EVENT_COLLECTION_KEYS.has(key) && Array.isArray(child)) {
      value[key] = child.filter((relation) => {
        if (!isRecord(relation)) {
          return false;
        }

        const eventId =
          typeof relation.calendarEventId === 'string'
            ? relation.calendarEventId
            : isRecord(relation.calendarEvent) &&
                typeof relation.calendarEvent.id === 'string'
              ? relation.calendarEvent.id
              : undefined;

        return (
          isRecord(relation) &&
          typeof eventId === 'string' &&
          visibleEvents.has(eventId)
        );
      });
    }

    sanitizeNestedCalendarEvents(value[key], visibleEvents, visited);
  }
};

const applyNestedVisibility = async (
  service: ApplyCalendarEventsVisibilityRestrictionsService,
  authContext: WorkspaceAuthContext,
  objectName: string,
  payload: QueryResultFieldValue,
) => {
  if (!isUserAuthContext(authContext) || objectName === 'calendarEvent') {
    return;
  }

  const eventIds = new Set<string>();

  collectNestedCalendarEventIds(payload, eventIds, new WeakSet());

  if (eventIds.size === 0) {
    return;
  }

  const visibleEvents = await service.getVisibleCalendarEventsById({
    eventIds: [...eventIds],
    workspaceId: authContext.workspace.id,
    userId: authContext.user.id,
    workspaceMemberId: authContext.workspaceMemberId,
  });

  sanitizeNestedCalendarEvents(payload, visibleEvents, new WeakSet());
};

@WorkspaceQueryHook({
  key: '*.findMany',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class CalendarEventNestedFindManyVisibilityPostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: QueryResultFieldValue,
  ): Promise<void> {
    await applyNestedVisibility(
      this.applyCalendarEventsVisibilityRestrictionsService,
      authContext,
      objectName,
      payload,
    );
  }
}

@WorkspaceQueryHook({
  key: '*.findOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class CalendarEventNestedFindOneVisibilityPostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: QueryResultFieldValue,
  ): Promise<void> {
    await applyNestedVisibility(
      this.applyCalendarEventsVisibilityRestrictionsService,
      authContext,
      objectName,
      payload,
    );
  }
}
