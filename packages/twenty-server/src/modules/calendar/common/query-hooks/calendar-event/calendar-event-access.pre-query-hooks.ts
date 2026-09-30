import { Injectable } from '@nestjs/common';

import {
  type CreateManyResolverArgs,
  type CreateOneResolverArgs,
  type DeleteManyResolverArgs,
  type DeleteOneResolverArgs,
  type DestroyManyResolverArgs,
  type DestroyOneResolverArgs,
  type FindDuplicatesResolverArgs,
  type FindManyResolverArgs,
  type FindOneResolverArgs,
  type GroupByResolverArgs,
  type MergeManyResolverArgs,
  type RestoreManyResolverArgs,
  type RestoreOneResolverArgs,
  type UpdateManyResolverArgs,
  type UpdateOneResolverArgs,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ApplyCalendarEventsVisibilityRestrictionsService } from 'src/modules/calendar/common/query-hooks/calendar-event/services/apply-calendar-events-visibility-restrictions.service';

type UserCalendarMutationContext = Extract<
  WorkspaceAuthContext,
  { type: 'user' }
>;

const isUserContext = (
  authContext: WorkspaceAuthContext,
): authContext is UserCalendarMutationContext => authContext.type === 'user';

const assertNoChannelOrOwnerReassignment = (data: Record<string, unknown>) => {
  if (
    Object.hasOwn(data, 'calendarChannelEventAssociations') ||
    Object.hasOwn(data, 'ownerId')
  ) {
    throw new ForbiddenError(
      'Calendar event ownership and sharing must use the supported calendar flow',
    );
  }
};

@Injectable()
@WorkspaceQueryHook('calendarEvent.findMany')
export class CalendarEventFindManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    return {
      ...payload,
      filter:
        await this.applyCalendarEventsVisibilityRestrictionsService.buildUserAccessFilter(
          {
            workspaceId: authContext.workspace.id,
            userWorkspaceId: authContext.userWorkspaceId,
            workspaceMemberId: authContext.workspaceMemberId,
            existingFilter: payload.filter,
          },
        ),
    };
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.findOne')
export class CalendarEventFindOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindOneResolverArgs,
  ): Promise<FindOneResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    return {
      ...payload,
      filter:
        await this.applyCalendarEventsVisibilityRestrictionsService.buildUserAccessFilter(
          {
            workspaceId: authContext.workspace.id,
            userWorkspaceId: authContext.userWorkspaceId,
            workspaceMemberId: authContext.workspaceMemberId,
            existingFilter: payload.filter,
          },
        ),
    };
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.groupBy')
export class CalendarEventGroupByAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: GroupByResolverArgs,
  ): Promise<GroupByResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    return {
      ...payload,
      filter:
        await this.applyCalendarEventsVisibilityRestrictionsService.buildUserAccessFilter(
          {
            workspaceId: authContext.workspace.id,
            userWorkspaceId: authContext.userWorkspaceId,
            workspaceMemberId: authContext.workspaceMemberId,
            existingFilter: payload.filter,
          },
        ),
    };
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.findDuplicates')
export class CalendarEventFindDuplicatesAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: FindDuplicatesResolverArgs,
  ): Promise<FindDuplicatesResolverArgs> {
    if (isUserContext(authContext)) {
      throw new ForbiddenError(
        'Calendar event duplicate discovery is not available',
      );
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.createOne')
export class CalendarEventCreateOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    if (isUserContext(authContext)) {
      throw new ForbiddenError(
        'Use the connected-calendar event creation flow',
      );
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.createMany')
export class CalendarEventCreateManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs,
  ): Promise<CreateManyResolverArgs> {
    if (isUserContext(authContext)) {
      throw new ForbiddenError(
        'Use the connected-calendar event creation flow',
      );
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.updateOne')
export class CalendarEventUpdateOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    assertNoChannelOrOwnerReassignment(payload.data);
    const isWritable =
      await this.applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
        {
          eventId: payload.id,
          workspaceId: authContext.workspace.id,
          userWorkspaceId: authContext.userWorkspaceId,
          workspaceMemberId: authContext.workspaceMemberId,
        },
      );

    if (!isWritable) {
      throw new ForbiddenError('Calendar event is not writable');
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.updateMany')
export class CalendarEventUpdateManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateManyResolverArgs,
  ): Promise<UpdateManyResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    assertNoChannelOrOwnerReassignment(payload.data);

    return {
      ...payload,
      filter:
        await this.applyCalendarEventsVisibilityRestrictionsService.buildUserAccessFilter(
          {
            workspaceId: authContext.workspace.id,
            userWorkspaceId: authContext.userWorkspaceId,
            workspaceMemberId: authContext.workspaceMemberId,
            existingFilter: payload.filter,
            allowMetadataVisibility: false,
          },
        ),
    };
  }
}

const createWriteAccessFilter = async (
  service: ApplyCalendarEventsVisibilityRestrictionsService,
  authContext: UserCalendarMutationContext,
  existingFilter: unknown,
) =>
  service.buildUserAccessFilter({
    workspaceId: authContext.workspace.id,
    userWorkspaceId: authContext.userWorkspaceId,
    workspaceMemberId: authContext.workspaceMemberId,
    existingFilter,
    allowMetadataVisibility: false,
  });

@Injectable()
@WorkspaceQueryHook('calendarEvent.deleteOne')
export class CalendarEventDeleteOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteOneResolverArgs,
  ): Promise<DeleteOneResolverArgs> {
    if (
      isUserContext(authContext) &&
      !(await this.applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
        {
          eventId: payload.id,
          workspaceId: authContext.workspace.id,
          userWorkspaceId: authContext.userWorkspaceId,
          workspaceMemberId: authContext.workspaceMemberId,
        },
      ))
    ) {
      throw new ForbiddenError('Calendar event is not writable');
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.deleteMany')
export class CalendarEventDeleteManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteManyResolverArgs,
  ): Promise<DeleteManyResolverArgs> {
    return isUserContext(authContext)
      ? {
          ...payload,
          filter: await createWriteAccessFilter(
            this.applyCalendarEventsVisibilityRestrictionsService,
            authContext,
            payload.filter,
          ),
        }
      : payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.restoreOne')
export class CalendarEventRestoreOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: RestoreOneResolverArgs,
  ): Promise<RestoreOneResolverArgs> {
    if (
      isUserContext(authContext) &&
      !(await this.applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
        {
          eventId: payload.id,
          workspaceId: authContext.workspace.id,
          userWorkspaceId: authContext.userWorkspaceId,
          workspaceMemberId: authContext.workspaceMemberId,
        },
      ))
    ) {
      throw new ForbiddenError('Calendar event is not writable');
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.restoreMany')
export class CalendarEventRestoreManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: RestoreManyResolverArgs,
  ): Promise<RestoreManyResolverArgs> {
    return isUserContext(authContext)
      ? {
          ...payload,
          filter: await createWriteAccessFilter(
            this.applyCalendarEventsVisibilityRestrictionsService,
            authContext,
            payload.filter,
          ),
        }
      : payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.destroyOne')
export class CalendarEventDestroyOneAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DestroyOneResolverArgs,
  ): Promise<DestroyOneResolverArgs> {
    if (
      isUserContext(authContext) &&
      !(await this.applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
        {
          eventId: payload.id,
          workspaceId: authContext.workspace.id,
          userWorkspaceId: authContext.userWorkspaceId,
          workspaceMemberId: authContext.workspaceMemberId,
        },
      ))
    ) {
      throw new ForbiddenError('Calendar event is not writable');
    }

    return payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.destroyMany')
export class CalendarEventDestroyManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DestroyManyResolverArgs,
  ): Promise<DestroyManyResolverArgs> {
    return isUserContext(authContext)
      ? {
          ...payload,
          filter: await createWriteAccessFilter(
            this.applyCalendarEventsVisibilityRestrictionsService,
            authContext,
            payload.filter,
          ),
        }
      : payload;
  }
}

@Injectable()
@WorkspaceQueryHook('calendarEvent.mergeMany')
export class CalendarEventMergeManyAccessPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly applyCalendarEventsVisibilityRestrictionsService: ApplyCalendarEventsVisibilityRestrictionsService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: MergeManyResolverArgs,
  ): Promise<MergeManyResolverArgs> {
    if (!isUserContext(authContext)) {
      return payload;
    }

    const writableResults = await Promise.all(
      payload.ids.map((eventId) =>
        this.applyCalendarEventsVisibilityRestrictionsService.canUserWriteCalendarEvent(
          {
            eventId,
            workspaceId: authContext.workspace.id,
            userWorkspaceId: authContext.userWorkspaceId,
            workspaceMemberId: authContext.workspaceMemberId,
          },
        ),
      ),
    );

    if (writableResults.some((isWritable) => !isWritable)) {
      throw new ForbiddenError('Calendar event is not writable');
    }

    return payload;
  }
}
