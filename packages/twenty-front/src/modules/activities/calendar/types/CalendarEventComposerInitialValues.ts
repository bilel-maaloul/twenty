import { type EmailComposerContextRecord } from '@/activities/emails/recipients/types/EmailComposerContextRecord';

export type CalendarEventComposerInitialValues = {
  connectedAccountId: string;
  contextRecord: EmailComposerContextRecord;
  defaultAttendees: string;
  defaultAttendeePersonId?: string;
  initialDate?: string;
  onCreated?: () => void;
  timeZone: string;
};
