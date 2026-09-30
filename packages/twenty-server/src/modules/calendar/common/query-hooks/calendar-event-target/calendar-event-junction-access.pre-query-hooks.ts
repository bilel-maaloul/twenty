import { Injectable } from '@nestjs/common';

import {
  type WorkspaceQueryHookKey,
  WorkspaceQueryHook,
} from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type ResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';

const createUserDeniedCalendarJunctionHook = (key: WorkspaceQueryHookKey) => {
  @Injectable()
  class UserDeniedCalendarJunctionHook implements WorkspacePreQueryHookInstance {
    async execute(
      authContext: WorkspaceAuthContext,
      _objectName: string,
      payload: ResolverArgs,
    ): Promise<ResolverArgs> {
      if (authContext.type === 'user') {
        throw new ForbiddenError(
          'Calendar relationship records must be accessed through calendar events',
        );
      }

      return payload;
    }
  }

  WorkspaceQueryHook(key)(UserDeniedCalendarJunctionHook);

  return UserDeniedCalendarJunctionHook;
};

export const CalendarEventTargetFindOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.findOne');
export const CalendarEventTargetFindManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.findMany');
export const CalendarEventTargetFindDuplicatesAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.findDuplicates');
export const CalendarEventTargetGroupByAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.groupBy');
export const CalendarEventTargetUpdateOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.updateOne');
export const CalendarEventTargetUpdateManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.updateMany');
export const CalendarEventTargetDeleteOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.deleteOne');
export const CalendarEventTargetDeleteManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.deleteMany');
export const CalendarEventTargetRestoreOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.restoreOne');
export const CalendarEventTargetRestoreManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.restoreMany');
export const CalendarEventTargetDestroyOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.destroyOne');
export const CalendarEventTargetDestroyManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.destroyMany');
export const CalendarEventTargetMergeManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventTarget.mergeMany');

export const CalendarEventParticipantFindOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.findOne');
export const CalendarEventParticipantFindManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.findMany');
export const CalendarEventParticipantFindDuplicatesAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarEventParticipant.findDuplicates',
  );
export const CalendarEventParticipantGroupByAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.groupBy');
export const CalendarEventParticipantCreateOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.createOne');
export const CalendarEventParticipantCreateManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.createMany');
export const CalendarEventParticipantUpdateOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.updateOne');
export const CalendarEventParticipantUpdateManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.updateMany');
export const CalendarEventParticipantDeleteOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.deleteOne');
export const CalendarEventParticipantDeleteManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.deleteMany');
export const CalendarEventParticipantRestoreOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.restoreOne');
export const CalendarEventParticipantRestoreManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.restoreMany');
export const CalendarEventParticipantDestroyOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.destroyOne');
export const CalendarEventParticipantDestroyManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.destroyMany');
export const CalendarEventParticipantMergeManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook('calendarEventParticipant.mergeMany');

export const CalendarChannelEventAssociationFindOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.findOne',
  );
export const CalendarChannelEventAssociationFindManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.findMany',
  );
export const CalendarChannelEventAssociationFindDuplicatesAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.findDuplicates',
  );
export const CalendarChannelEventAssociationGroupByAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.groupBy',
  );
export const CalendarChannelEventAssociationCreateOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.createOne',
  );
export const CalendarChannelEventAssociationCreateManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.createMany',
  );
export const CalendarChannelEventAssociationUpdateOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.updateOne',
  );
export const CalendarChannelEventAssociationUpdateManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.updateMany',
  );
export const CalendarChannelEventAssociationDeleteOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.deleteOne',
  );
export const CalendarChannelEventAssociationDeleteManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.deleteMany',
  );
export const CalendarChannelEventAssociationRestoreOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.restoreOne',
  );
export const CalendarChannelEventAssociationRestoreManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.restoreMany',
  );
export const CalendarChannelEventAssociationDestroyOneAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.destroyOne',
  );
export const CalendarChannelEventAssociationDestroyManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.destroyMany',
  );
export const CalendarChannelEventAssociationMergeManyAccessPreQueryHook =
  createUserDeniedCalendarJunctionHook(
    'calendarChannelEventAssociation.mergeMany',
  );
