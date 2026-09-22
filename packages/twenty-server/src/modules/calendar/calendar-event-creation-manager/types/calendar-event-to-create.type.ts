import { type CalendarEventAttendeeToCreate } from 'src/modules/calendar/calendar-event-creation-manager/types/calendar-event-attendee-to-create.type';

export type CalendarEventToCreate = {
  title: string;
  eventType?: string;
  ownerId?: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  isFullDay: boolean;
  timeZone: string;
  attendees: CalendarEventAttendeeToCreate[];
  sendInvitations: boolean;
  addConferencing: boolean;
  reminderMinutesBefore?: number;
  recurrenceFrequency?: string;
  recurrenceEndDate?: string;
  recurrenceOccurrences?: number;
};
