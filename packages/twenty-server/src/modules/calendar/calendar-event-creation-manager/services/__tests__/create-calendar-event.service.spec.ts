import { ConnectedAccountProvider } from 'twenty-shared/types';

import { CalendarEventCreationExceptionCode } from 'src/modules/calendar/calendar-event-creation-manager/exceptions/calendar-event-creation.exception';
import { CreateCalendarEventService } from 'src/modules/calendar/calendar-event-creation-manager/services/create-calendar-event.service';
import { type ComposedCalendarEvent } from 'src/modules/calendar/calendar-event-creation-manager/types/composed-calendar-event.type';
import { type CalendarEventToCreate } from 'src/modules/calendar/calendar-event-creation-manager/types/calendar-event-to-create.type';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';

const WORKSPACE_ID = 'workspace-id';

const createdEvent: FetchedCalendarEvent = {
  id: 'provider-event-id',
  title: 'Planning session',
  iCalUid: 'ical-uid',
  description: '',
  startsAt: '2026-09-22T10:00:00Z',
  endsAt: '2026-09-22T11:00:00Z',
  location: '',
  isFullDay: false,
  isCanceled: false,
  conferenceLinkLabel: '',
  conferenceLinkUrl: '',
  externalCreatedAt: '2026-09-22T10:00:00Z',
  externalUpdatedAt: '2026-09-22T10:00:00Z',
  conferenceSolution: '',
  participants: [],
  status: 'confirmed',
};

const composedEvent: ComposedCalendarEvent = {
  input: {
    title: 'Planning session',
    eventType: 'CALL',
    ownerId: 'owner-id',
    startsAt: '2026-09-22T10:00:00Z',
    endsAt: '2026-09-22T11:00:00Z',
    isFullDay: false,
    timeZone: 'UTC',
    attendees: [],
    sendInvitations: false,
    addConferencing: false,
    reminderMinutesBefore: 15,
    recurrenceFrequency: 'NONE',
  } as CalendarEventToCreate,
  connectedAccount: {
    id: 'account-id',
    provider: ConnectedAccountProvider.GOOGLE,
  } as ComposedCalendarEvent['connectedAccount'],
  calendarChannel: {
    id: 'calendar-channel-id',
  } as ComposedCalendarEvent['calendarChannel'],
};

describe('CreateCalendarEventService', () => {
  it('returns the persisted local event id and forwards calendar metadata', async () => {
    const saveCalendarEventsAndEnqueueContactCreationJob = jest
      .fn()
      .mockResolvedValue({ calendarEventIds: ['calendar-event-id'] });
    const service = new CreateCalendarEventService(
      {} as never,
      {} as never,
      {} as never,
      { saveCalendarEventsAndEnqueueContactCreationJob } as never,
    );

    await expect(
      service.persistCalendarEvent(createdEvent, composedEvent, WORKSPACE_ID),
    ).resolves.toBe('calendar-event-id');

    expect(saveCalendarEventsAndEnqueueContactCreationJob).toHaveBeenCalledWith(
      [createdEvent],
      composedEvent.calendarChannel,
      composedEvent.connectedAccount,
      WORKSPACE_ID,
      {
        eventType: 'CALL',
        ownerId: 'owner-id',
        reminderMinutesBefore: 15,
        recurrenceFrequency: 'NONE',
        recurrenceEndDate: undefined,
        recurrenceOccurrences: undefined,
      },
    );
  });

  it('returns a persistence error instead of a successful result when saving fails', async () => {
    const saveCalendarEventsAndEnqueueContactCreationJob = jest
      .fn()
      .mockRejectedValue(new Error('eventType metadata is missing'));
    const service = new CreateCalendarEventService(
      {} as never,
      {} as never,
      {} as never,
      { saveCalendarEventsAndEnqueueContactCreationJob } as never,
    );

    await expect(
      service.persistCalendarEvent(createdEvent, composedEvent, WORKSPACE_ID),
    ).rejects.toMatchObject({
      code: CalendarEventCreationExceptionCode.PERSISTENCE_FAILED,
    });
  });

  it('rejects a save result that does not contain a local event id', async () => {
    const saveCalendarEventsAndEnqueueContactCreationJob = jest
      .fn()
      .mockResolvedValue({ calendarEventIds: [] });
    const service = new CreateCalendarEventService(
      {} as never,
      {} as never,
      {} as never,
      { saveCalendarEventsAndEnqueueContactCreationJob } as never,
    );

    await expect(
      service.persistCalendarEvent(createdEvent, composedEvent, WORKSPACE_ID),
    ).rejects.toMatchObject({
      code: CalendarEventCreationExceptionCode.PERSISTENCE_FAILED,
    });
  });
});
