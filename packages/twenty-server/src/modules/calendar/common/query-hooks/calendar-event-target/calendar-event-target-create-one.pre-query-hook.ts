import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';
import { assertCalendarEventTargetWriteAccess } from 'src/modules/calendar/common/query-hooks/calendar-event-target/assert-calendar-event-target-write-access.util';
import { applyManuallyAssignedDefault } from 'src/modules/match-participant/utils/apply-manually-assigned-default.util';

@WorkspaceQueryHook('calendarEventTarget.createOne')
export class CalendarEventTargetCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    await assertCalendarEventTargetWriteAccess(
      authContext,
      payload.data,
      this.applyCalendarEventsVisibilityRestrictionsService,
    );

    return {
      ...payload,
      data: applyManuallyAssignedDefault(payload.data),
    };
  }
}
