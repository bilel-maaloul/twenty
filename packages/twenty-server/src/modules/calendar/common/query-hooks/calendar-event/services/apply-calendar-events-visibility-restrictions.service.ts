import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import groupBy from 'lodash.groupby';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { CalendarChannelVisibility } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type CalendarChannelEventAssociationWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-channel-event-association.workspace-entity';
import { type CalendarEventWorkspaceEntity } from 'src/modules/calendar/common/standard-objects/calendar-event.workspace-entity';

type BuildCalendarEventAccessFilterArgs = {
  workspaceId: string;
  userWorkspaceId: string;
  workspaceMemberId: string;
  existingFilter?: unknown;
  allowMetadataVisibility?: boolean;
};

@Injectable()
export class ApplyCalendarEventsVisibilityRestrictionsService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
  ) {}

  public async applyCalendarEventsVisibilityRestrictions(
    calendarEvents: CalendarEventWorkspaceEntity[],
    workspaceId: string,
    userId?: string,
    workspaceMemberId?: string,
  ) {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const calendarChannelEventAssociationRepository =
          this.workspaceOrmManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
            'calendarChannelEventAssociation',
          );

        const calendarChannelCalendarEventsAssociations =
          await calendarChannelEventAssociationRepository.find({
            where: {
              calendarEventId: In(calendarEvents.map((event) => event.id)),
            },
          });

        const calendarChannelIds = [
          ...new Set(
            calendarChannelCalendarEventsAssociations.map(
              (association) => association.calendarChannelId,
            ),
          ),
        ];

        const calendarChannelsFromCore =
          calendarChannelIds.length > 0
            ? await this.calendarChannelRepository.find({
                where: {
                  id: In(calendarChannelIds),
                  workspaceId,
                },
              })
            : [];

        const calendarChannelMap = new Map(
          calendarChannelsFromCore.map((channel) => [channel.id, channel]),
        );

        for (let i = calendarEvents.length - 1; i >= 0; i--) {
          if (
            isDefined(workspaceMemberId) &&
            calendarEvents[i].ownerId === workspaceMemberId
          ) {
            continue;
          }

          const associations = calendarChannelCalendarEventsAssociations.filter(
            (association) =>
              association.calendarEventId === calendarEvents[i].id,
          );

          const calendarChannels = associations
            .map((association) =>
              calendarChannelMap.get(association.calendarChannelId),
            )
            .filter(isDefined);

          const calendarChannelsGroupByVisibility = groupBy(
            calendarChannels,
            (channel) => channel.visibility,
          );

          if (
            calendarChannelsGroupByVisibility[
              CalendarChannelVisibility.SHARE_EVERYTHING
            ]
          ) {
            continue;
          }

          if (isDefined(userId)) {
            const userWorkspace = await this.userWorkspaceRepository.findOne({
              where: { userId, workspaceId },
              select: ['id'],
            });

            if (userWorkspace) {
              const connectedAccounts =
                await this.connectedAccountRepository.find({
                  where: {
                    calendarChannels: {
                      id: In(calendarChannels.map((channel) => channel.id)),
                    },
                    userWorkspaceId: userWorkspace.id,
                    workspaceId,
                  },
                });

              if (connectedAccounts.length > 0) {
                continue;
              }
            }
          }

          if (
            calendarChannelsGroupByVisibility[
              CalendarChannelVisibility.METADATA
            ]
          ) {
            calendarEvents[i].title =
              FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
            calendarEvents[i].description =
              FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED;
            continue;
          }

          calendarEvents.splice(i, 1);
        }

        return calendarEvents;
      },
      authContext,
      { lite: true },
    );
  }

  public async buildUserAccessFilter({
    workspaceId,
    userWorkspaceId,
    workspaceMemberId,
    existingFilter,
    allowMetadataVisibility = true,
  }: BuildCalendarEventAccessFilterArgs): Promise<Record<string, unknown>> {
    const channelVisibilities = allowMetadataVisibility
      ? [
          CalendarChannelVisibility.SHARE_EVERYTHING,
          CalendarChannelVisibility.METADATA,
        ]
      : [CalendarChannelVisibility.SHARE_EVERYTHING];

    const [sharedChannels, connectedAccounts] = await Promise.all([
      this.calendarChannelRepository.find({
        where: {
          workspaceId,
          visibility: In(channelVisibilities),
        },
        select: ['id'],
      }),
      this.connectedAccountRepository.find({
        where: { workspaceId, userWorkspaceId },
        relations: { calendarChannels: true },
        select: {
          id: true,
          calendarChannels: { id: true },
        },
      }),
    ]);

    const visibleCalendarChannelIds = new Set(
      sharedChannels.map(({ id }) => id),
    );

    for (const connectedAccount of connectedAccounts) {
      for (const calendarChannel of connectedAccount.calendarChannels ?? []) {
        visibleCalendarChannelIds.add(calendarChannel.id);
      }
    }

    const allowedRecords = [
      { ownerId: { eq: workspaceMemberId } },
      ...(visibleCalendarChannelIds.size > 0
        ? [
            {
              calendarChannelEventAssociations: {
                calendarChannelId: {
                  in: [...visibleCalendarChannelIds],
                },
              },
            },
          ]
        : []),
    ];

    const accessFilter = { or: allowedRecords };

    return isDefined(existingFilter)
      ? { and: [existingFilter, accessFilter] }
      : accessFilter;
  }

  public async getVisibleCalendarEventsById({
    eventIds,
    workspaceId,
    userId,
    workspaceMemberId,
  }: {
    eventIds: string[];
    workspaceId: string;
    userId: string;
    workspaceMemberId: string;
  }): Promise<
    Map<
      string,
      Pick<CalendarEventWorkspaceEntity, 'id' | 'title' | 'description'>
    >
  > {
    if (eventIds.length === 0) {
      return new Map();
    }

    const events = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const calendarEventRepository =
          this.workspaceOrmManager.getRepository<CalendarEventWorkspaceEntity>(
            'calendarEvent',
          );

        return calendarEventRepository.find({
          where: { id: In([...new Set(eventIds)]) },
          select: ['id', 'title', 'description', 'ownerId'],
        });
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );

    const visibleEvents = await this.applyCalendarEventsVisibilityRestrictions(
      events,
      workspaceId,
      userId,
      workspaceMemberId,
    );

    return new Map(
      visibleEvents.map((event) => [
        event.id,
        {
          id: event.id,
          title: event.title,
          description: event.description,
        },
      ]),
    );
  }

  public async canUserWriteCalendarEvent({
    eventId,
    workspaceId,
    userWorkspaceId,
    workspaceMemberId,
  }: {
    eventId: string;
    workspaceId: string;
    userWorkspaceId: string;
    workspaceMemberId: string;
  }): Promise<boolean> {
    const allowedChannelIds = await this.getWritableCalendarChannelIds({
      workspaceId,
      userWorkspaceId,
    });

    return this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const calendarEventRepository =
          this.workspaceOrmManager.getRepository<CalendarEventWorkspaceEntity>(
            'calendarEvent',
          );
        const calendarEvent = await calendarEventRepository.findOne({
          where: { id: eventId },
          select: ['id', 'ownerId'],
        });

        if (!calendarEvent) {
          return false;
        }

        if (calendarEvent.ownerId === workspaceMemberId) {
          return true;
        }

        if (allowedChannelIds.length === 0) {
          return false;
        }

        const associationRepository =
          this.workspaceOrmManager.getRepository<CalendarChannelEventAssociationWorkspaceEntity>(
            'calendarChannelEventAssociation',
          );
        const associations = await associationRepository.find({
          where: { calendarEventId: eventId },
          select: ['calendarChannelId'],
        });

        return associations.some(({ calendarChannelId }) =>
          allowedChannelIds.includes(calendarChannelId),
        );
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  }

  private async getWritableCalendarChannelIds({
    workspaceId,
    userWorkspaceId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<string[]> {
    const connectedAccounts = await this.connectedAccountRepository.find({
      where: { workspaceId, userWorkspaceId },
      relations: { calendarChannels: true },
      select: {
        id: true,
        calendarChannels: { id: true },
      },
    });

    const writableChannelIds = new Set<string>();

    for (const connectedAccount of connectedAccounts) {
      for (const calendarChannel of connectedAccount.calendarChannels ?? []) {
        writableChannelIds.add(calendarChannel.id);
      }
    }

    return [...writableChannelIds];
  }
}
