export type ComposeCalendarEventParams = {
  title: string;
  eventType?: string;
  ownerId?: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  isFullDay?: boolean;
  timeZone?: string;
  attendees?: string;
  sendInvitations?: boolean;
  addConferencing?: boolean;
  reminderMinutesBefore?: number;
  recurrenceFrequency?: string;
  recurrenceEndDate?: string;
  recurrenceOccurrences?: number;
  connectedAccountId?: string;
};
