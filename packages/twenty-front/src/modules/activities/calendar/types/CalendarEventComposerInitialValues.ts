import { type EmailComposerContextRecord } from '@/activities/emails/recipients/types/EmailComposerContextRecord';

export type CalendarEventComposerInitialValues = {
  connectedAccountId: string;
  contextRecord: EmailComposerContextRecord;
  defaultAttendees: string;
  defaultAttendeePersonId?: string;
  eventType?: string;
  initialDate?: string;
  ownerId?: string;
  onCreated?: () => void;
  reminderMinutesBefore?: number | null;
  recurrenceEndDate?: string | null;
  recurrenceFrequency?: string;
  recurrenceOccurrences?: number | null;
  timeZone: string;
};
