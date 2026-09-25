import { type LinksMetadata } from 'twenty-shared/types';

import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventParticipantWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-participant.workspace-entity';
import { type CalendarEventTargetWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event-target.workspace-entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

export class CalendarEventWorkspaceEntity extends BaseWorkspaceEntity {
  title: string | null;
  eventType: string;
  owner: EntityRelation<WorkspaceMemberWorkspaceEntity> | null;
  ownerId: string | null;
  isCanceled: boolean;
  isFullDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  externalCreatedAt: string | null;
  externalUpdatedAt: string | null;
  description: string | null;
  location: string | null;
  iCalUid: string | null;
  conferenceSolution: string | null;
  conferenceLink: LinksMetadata;
  reminderMinutesBefore: number | null;
  recurrenceFrequency: string | null;
  recurrenceEndDate: string | null;
  recurrenceOccurrences: number | null;
  calendarChannelEventAssociations: EntityRelation<
    CalendarChannelEventAssociationWorkspaceEntity[]
  >;
  calendarEventParticipants: EntityRelation<
    CalendarEventParticipantWorkspaceEntity[]
  >;
  calendarEventTargets: EntityRelation<CalendarEventTargetWorkspaceEntity[]>;
  // callRecordings reverse relation intentionally omitted from the TypeScript workspace
  // entity. It exists in standard metadata, but declaring a to-many relation here expands
  // recursive nested insert types and tips Person past TS's instantiation-depth limit.
}
