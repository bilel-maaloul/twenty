import { Injectable, Logger } from '@nestjs/common';

import { ConnectedAccountProvider } from 'twenty-shared/types';

import { CalDavCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/caldav/services/caldav-create-event.service';
import { GoogleCalendarCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/google-calendar/services/google-calendar-create-event.service';
import { MicrosoftCalendarCreateEventService } from 'src/modules/calendar/calendar-event-creation-manager/drivers/microsoft-calendar/services/microsoft-calendar-create-event.service';
import {
  CalendarEventCreationException,
  CalendarEventCreationExceptionCode,
} from 'src/modules/calendar/calendar-event-creation-manager/exceptions/calendar-event-creation.exception';
import { CalendarSaveEventsService } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-save-events.service';
import { type ComposedCalendarEvent } from 'src/modules/calendar/calendar-event-creation-manager/types/composed-calendar-event.type';
import { type FetchedCalendarEvent } from 'src/modules/calendar/common/types/fetched-calendar-event';

@Injectable()
export class CreateCalendarEventService {
  private readonly logger = new Logger(CreateCalendarEventService.name);

  constructor(
    private readonly googleCalendarCreateEventService: GoogleCalendarCreateEventService,
    private readonly microsoftCalendarCreateEventService: MicrosoftCalendarCreateEventService,
    private readonly calDavCreateEventService: CalDavCreateEventService,
    private readonly calendarSaveEventsService: CalendarSaveEventsService,
  ) {}

  async createComposedCalendarEvent(
    data: ComposedCalendarEvent,
  ): Promise<FetchedCalendarEvent> {
    switch (data.connectedAccount.provider) {
      case ConnectedAccountProvider.GOOGLE:
        return this.googleCalendarCreateEventService.createCalendarEvent(
          data.input,
          data.connectedAccount,
        );
      case ConnectedAccountProvider.MICROSOFT:
        return this.microsoftCalendarCreateEventService.createCalendarEvent(
          data.input,
          data.connectedAccount,
        );
      case ConnectedAccountProvider.IMAP_SMTP_CALDAV:
        return this.calDavCreateEventService.createCalendarEvent(
          data.input,
          data.connectedAccount,
        );
      default:
        throw new CalendarEventCreationException(
          `Calendar event creation is not supported for provider ${data.connectedAccount.provider}`,
          CalendarEventCreationExceptionCode.PROVIDER_NOT_SUPPORTED,
        );
    }
  }

  // Persist the created event right away so it is immediately visible in Twenty.
  // A successful response must include the local id; otherwise the caller
  // would report success for an event that cannot yet be read from Twenty.
  async persistCalendarEvent(
    createdEvent: FetchedCalendarEvent,
    data: ComposedCalendarEvent,
    workspaceId: string,
  ): Promise<string> {
    try {
      const { calendarEventIds } =
        await this.calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob(
          [createdEvent],
          data.calendarChannel,
          data.connectedAccount,
          workspaceId,
          {
            eventType: data.input.eventType,
            ownerId: data.input.ownerId,
            reminderMinutesBefore: data.input.reminderMinutesBefore,
            recurrenceFrequency: data.input.recurrenceFrequency,
            recurrenceEndDate: data.input.recurrenceEndDate,
            recurrenceOccurrences: data.input.recurrenceOccurrences,
          },
        );

      const calendarEventId = calendarEventIds[0];

      if (!calendarEventId) {
        throw new Error(
          'Calendar event persistence returned no calendar event id',
        );
      }

      return calendarEventId;
    } catch (persistenceError) {
      const errorMessage =
        persistenceError instanceof Error
          ? persistenceError.message
          : String(persistenceError);

      this.logger.error(
        `Failed to persist created calendar event: ${errorMessage}`,
      );

      throw new CalendarEventCreationException(
        `Failed to persist created calendar event: ${errorMessage}`,
        CalendarEventCreationExceptionCode.PERSISTENCE_FAILED,
      );
    }
  }
}
