import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ForbiddenError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  CalendarChannelEventAssociationCreateOneAccessPreQueryHook,
  CalendarEventTargetFindManyAccessPreQueryHook,
  CalendarEventParticipantFindManyAccessPreQueryHook,
} from 'src/modules/calendar/common/query-hooks/calendar-event-target/calendar-event-junction-access.pre-query-hooks';

describe('CalendarEventJunctionAccessPreQueryHooks', () => {
  const userAuthContext = {
    type: 'user',
    workspace: { id: 'workspace-id' },
  } as WorkspaceAuthContext;

  it('blocks direct user reads of calendar event junction records', async () => {
    const hook = new CalendarEventTargetFindManyAccessPreQueryHook();

    await expect(
      hook.execute(userAuthContext, 'calendarEventTarget', {
        filter: { id: { eq: 'target-id' } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('blocks direct user participant reads and association writes', async () => {
    const participantHook =
      new CalendarEventParticipantFindManyAccessPreQueryHook();
    const associationHook =
      new CalendarChannelEventAssociationCreateOneAccessPreQueryHook();

    await expect(
      participantHook.execute(userAuthContext, 'calendarEventParticipant', {
        filter: { calendarEventId: { eq: 'event-id' } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      associationHook.execute(
        userAuthContext,
        'calendarChannelEventAssociation',
        {
          data: {
            calendarEventId: 'event-id',
            calendarChannelId: 'channel-id',
          },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('leaves non-user operations unchanged', async () => {
    const hook =
      new CalendarChannelEventAssociationCreateOneAccessPreQueryHook();
    const applicationContext = {
      type: 'application',
      workspace: { id: 'workspace-id' },
    } as WorkspaceAuthContext;
    const payload = {
      data: { calendarEventId: 'event-id', calendarChannelId: 'channel-id' },
    };

    await expect(
      hook.execute(
        applicationContext,
        'calendarChannelEventAssociation',
        payload,
      ),
    ).resolves.toBe(payload);
  });
});
