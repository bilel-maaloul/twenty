import { getMissingCreateCalendarEventScopes } from '@/accounts/utils/hasMissingCreateCalendarEventScopes';
import { useCalendarEventTargetObjectMetadataItems } from '@/activities/calendar/hooks/useCalendarEventTargetObjectMetadataItems';
import { useCreateCalendarEvent } from '@/activities/calendar/hooks/useCreateCalendarEvent';
import { useRefetchTimelineCalendarEvents } from '@/activities/calendar/hooks/useRefetchTimelineCalendarEvents';
import { useCreateCalendarEventTargets } from '@/activities/calendar/hooks/useCreateCalendarEventTargets';
import { isCalendarEventComposerCreatingState } from '@/activities/calendar/states/isCalendarEventComposerCreatingState';
import { type CalendarEventComposerInitialValues } from '@/activities/calendar/types/CalendarEventComposerInitialValues';
import { type CalendarEventComposerTarget } from '@/activities/calendar/types/CalendarEventComposerTarget';
import { getCalendarEventComposerDefaultDates } from '@/activities/calendar/utils/getCalendarEventComposerDefaultDates';
import { getCalendarEventDatesAfterModeChange } from '@/activities/calendar/utils/getCalendarEventDatesAfterModeChange';
import { getCalendarEventDatesAfterStartChange } from '@/activities/calendar/utils/getCalendarEventDatesAfterStartChange';
import { isCalendarCreationEnabledForAccount } from '@/activities/calendar/utils/isCalendarCreationEnabledForAccount';
import { type EmailRecipient } from '@/activities/emails/recipients/types/EmailRecipient';
import { isValidEmailRecipientAddress } from '@/activities/emails/recipients/utils/isValidEmailRecipientAddress';
import { parseEmailRecipients } from '@/activities/emails/recipients/utils/parseEmailRecipients';
import { serializeEmailRecipients } from '@/activities/emails/recipients/utils/serializeEmailRecipients';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { searchRecordStoreFamilyState } from '@/object-record/record-picker/multiple-record-picker/states/searchRecordStoreComponentFamilyState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { isNonEmptyString } from '@sniptt/guards';
import { t } from '@lingui/core/macro';
import { useStore } from 'jotai';
import { useCallback, useState } from 'react';
import { MAX_EMAIL_RECIPIENTS } from 'twenty-shared/constants';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type SelectOption } from 'twenty-ui/input';
import { Temporal } from 'temporal-polyfill';

export const useCalendarEventComposer = ({
  initialValues,
  onCreated,
}: {
  initialValues: CalendarEventComposerInitialValues | null;
  onCreated: () => void;
}) => {
  const { accounts, loading: accountsLoading } = useMyConnectedAccounts();
  const { createCalendarEvent, loading: isCreating } = useCreateCalendarEvent();
  const { refetchTimelineCalendarEvents } = useRefetchTimelineCalendarEvents();
  const { createCalendarEventTargets } = useCreateCalendarEventTargets();
  const { enqueueErrorSnackBar } = useSnackBar();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const store = useStore();
  const isCalendarEventComposerCreating = useAtomStateValue(
    isCalendarEventComposerCreatingState,
  );

  const [connectedAccountId, setConnectedAccountId] = useState(
    initialValues?.connectedAccountId ?? '',
  );
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState(
    initialValues?.eventType ?? 'MEETING',
  );
  const [ownerId, setOwnerId] = useState<string | null>(
    initialValues?.ownerId ?? currentWorkspaceMember?.id ?? null,
  );
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [timeZone, setTimeZone] = useState(initialValues?.timeZone ?? 'UTC');
  const [isFullDay, setIsFullDay] = useState(false);
  const [attendees, setAttendees] = useState<EmailRecipient[]>(() =>
    parseEmailRecipients(initialValues?.defaultAttendees ?? '').map(
      (attendee) => ({
        ...attendee,
        personId: initialValues?.defaultAttendeePersonId,
      }),
    ),
  );
  const [sendInvitations, setSendInvitations] = useState(true);
  const [pickedTargets, setPickedTargets] = useState<
    CalendarEventComposerTarget[]
  >([]);
  const [discardedTargetRecordIds, setDiscardedTargetRecordIds] = useState<
    string[]
  >([]);
  const [addConferencing, setAddConferencing] = useState(false);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<
    number | null
  >(initialValues?.reminderMinutesBefore ?? null);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(
    initialValues?.recurrenceFrequency ?? 'NONE',
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | null>(
    initialValues?.recurrenceEndDate ?? null,
  );
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState<
    number | null
  >(initialValues?.recurrenceOccurrences ?? null);
  const [dates, setDates] = useState(() =>
    getCalendarEventComposerDefaultDates({
      initialDate: initialValues?.initialDate,
      now: Temporal.Now.instant(),
      timeZone: initialValues?.timeZone ?? 'UTC',
    }),
  );

  const calendarAccounts = accounts.filter(isCalendarCreationEnabledForAccount);
  const accountOptions: SelectOption<string>[] = calendarAccounts.map(
    (account) => ({ label: account.handle, value: account.id }),
  );
  const selectedAccount = calendarAccounts.find(
    (account) => account.id === connectedAccountId,
  );
  const missingScopes = isDefined(selectedAccount)
    ? getMissingCreateCalendarEventScopes(selectedAccount)
    : [];

  const attendeeEmails = attendees.map(({ address }) => address);
  const invalidAttendeeEmails = sendInvitations
    ? attendeeEmails.filter((email) => !isValidEmailRecipientAddress(email))
    : [];
  const hasTooManyAttendees =
    sendInvitations && attendeeEmails.length > MAX_EMAIL_RECIPIENTS;

  // Guests that match a person are related to the event server-side once
  // participants are matched, so only the record the composer was opened from
  // needs to be offered here.
  const targetObjectMetadataItems = useCalendarEventTargetObjectMetadataItems();
  const contextObjectMetadataItem = targetObjectMetadataItems.find(
    ({ nameSingular }) =>
      nameSingular === initialValues?.contextRecord.objectNameSingular,
  );

  const { record: contextRecord, loading: isContextRecordLoading } =
    useFindOneRecord({
      // The composer can be opened from a record the junction cannot target; the
      // query is skipped there, but the hook still needs a resolvable object.
      objectNameSingular:
        contextObjectMetadataItem?.nameSingular ??
        CoreObjectNameSingular.Person,
      objectRecordId: initialValues?.contextRecord.recordId,
      skip: !isDefined(contextObjectMetadataItem),
    });

  const contextTargets: CalendarEventComposerTarget[] =
    isDefined(contextObjectMetadataItem) && isDefined(contextRecord)
      ? [
          {
            objectMetadataId: contextObjectMetadataItem.id,
            recordId: contextRecord.id,
            record: contextRecord,
          },
        ]
      : [];

  const canPickTargets = targetObjectMetadataItems.length > 0;

  const targets = [...contextTargets, ...pickedTargets].filter(
    ({ recordId }, index, allTargets) =>
      !discardedTargetRecordIds.includes(recordId) &&
      allTargets.findIndex((target) => target.recordId === recordId) === index,
  );

  const handleTargetChange = (morphItem: RecordPickerPickableMorphItem) => {
    if (!morphItem.isSelected) {
      setPickedTargets((currentTargets) =>
        currentTargets.filter(
          ({ recordId }) => recordId !== morphItem.recordId,
        ),
      );
      setDiscardedTargetRecordIds((currentRecordIds) => [
        ...currentRecordIds,
        morphItem.recordId,
      ]);

      return;
    }

    setDiscardedTargetRecordIds((currentRecordIds) =>
      currentRecordIds.filter((recordId) => recordId !== morphItem.recordId),
    );

    const record = store.get(
      searchRecordStoreFamilyState.atomFamily(morphItem.recordId),
    )?.record;

    if (!isDefined(record)) {
      return;
    }

    setPickedTargets((currentTargets) =>
      currentTargets.some(({ recordId }) => recordId === morphItem.recordId)
        ? currentTargets
        : [
            ...currentTargets,
            {
              objectMetadataId: morphItem.objectMetadataId,
              recordId: morphItem.recordId,
              record,
            },
          ],
    );
  };

  const hasValidDateRange = isFullDay
    ? dates.endsAt.slice(0, 10) > dates.startsAt.slice(0, 10)
    : Date.parse(dates.endsAt) > Date.parse(dates.startsAt);

  const hasValidRecurrence =
    recurrenceFrequency === 'NONE' ||
    isNonEmptyString(recurrenceEndDate ?? '') ||
    (recurrenceOccurrences !== null && recurrenceOccurrences > 0);

  const canCreate =
    isNonEmptyString(title.trim()) &&
    isDefined(selectedAccount) &&
    missingScopes.length === 0 &&
    invalidAttendeeEmails.length === 0 &&
    !hasTooManyAttendees &&
    hasValidDateRange &&
    hasValidRecurrence &&
    // Creating before it resolves would silently drop the relation the composer
    // was opened for.
    !(isDefined(contextObjectMetadataItem) && isContextRecordLoading) &&
    !isCreating &&
    !isCalendarEventComposerCreating;

  const handleIsFullDayChange = (nextIsFullDay: boolean) => {
    setDates(
      getCalendarEventDatesAfterModeChange({
        dates,
        isFullDay: nextIsFullDay,
        timeZone,
      }),
    );

    setIsFullDay(nextIsFullDay);
  };

  const handleStartsAtChange = (value: string | null) => {
    if (!isDefined(value)) {
      return;
    }

    setDates((currentDates) =>
      getCalendarEventDatesAfterStartChange({
        dates: currentDates,
        startsAt: value,
        isFullDay,
      }),
    );
  };

  const setEndsAt = (value: string | null) => {
    if (isDefined(value)) {
      setDates((currentDates) => ({
        ...currentDates,
        endsAt:
          isFullDay && value.slice(0, 10) <= currentDates.startsAt.slice(0, 10)
            ? Temporal.PlainDate.from(currentDates.startsAt.slice(0, 10))
                .add({ days: 1 })
                .toString()
            : value,
      }));
    }
  };

  const handleCreate = useCallback(async () => {
    if (!canCreate || store.get(isCalendarEventComposerCreatingState.atom)) {
      return;
    }

    store.set(isCalendarEventComposerCreatingState.atom, true);

    try {
      const { success, calendarEventId } = await createCalendarEvent({
        connectedAccountId,
        title: title.trim(),
        eventType,
        ownerId: ownerId ?? undefined,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
        isFullDay,
        timeZone,
        attendees: serializeEmailRecipients(attendees),
        sendInvitations,
        addConferencing,
        reminderMinutesBefore: reminderMinutesBefore ?? undefined,
        recurrenceFrequency,
        recurrenceEndDate: recurrenceEndDate ?? undefined,
        recurrenceOccurrences: recurrenceOccurrences ?? undefined,
      });

      if (!success) {
        return;
      }

      // The event already exists at this point, so a failure to link the
      // related records must not keep the composer open: retrying would create
      // a second event. A missing id means persistence failed, and the next
      // provider sync then recreates the event without these links.
      if (targets.length > 0) {
        let areTargetsLinked = false;

        if (isDefined(calendarEventId)) {
          try {
            await createCalendarEventTargets({ calendarEventId, targets });
            areTargetsLinked = true;
          } catch {
            areTargetsLinked = false;
          }
        }

        if (areTargetsLinked) {
          // createCalendarEvent already refetched, but that ran before these
          // links existed, so an event related only through them stays invisible.
          await refetchTimelineCalendarEvents();
        } else {
          enqueueErrorSnackBar({
            message: t`Failed to link the related records to this event`,
          });
        }
      }

      initialValues?.onCreated?.();
      onCreated();
    } finally {
      store.set(isCalendarEventComposerCreatingState.atom, false);
    }
  }, [
    addConferencing,
    attendees,
    canCreate,
    connectedAccountId,
    createCalendarEvent,
    createCalendarEventTargets,
    dates.endsAt,
    dates.startsAt,
    description,
    eventType,
    enqueueErrorSnackBar,
    isFullDay,
    location,
    ownerId,
    recurrenceEndDate,
    recurrenceFrequency,
    recurrenceOccurrences,
    reminderMinutesBefore,
    onCreated,
    initialValues,
    refetchTimelineCalendarEvents,
    sendInvitations,
    store,
    targets,
    timeZone,
    title,
  ]);

  return {
    accountOptions,
    accountsLoading,
    addConferencing,
    attendees,
    attendeeEmails,
    canCreate,
    canPickTargets,
    connectedAccountId,
    dates,
    description,
    eventType,
    handleCreate,
    handleIsFullDayChange,
    handleStartsAtChange,
    handleTargetChange,
    hasTooManyAttendees,
    hasValidDateRange,
    hasValidRecurrence,
    invalidAttendeeEmails,
    isFullDay,
    location,
    missingScopes,
    ownerId,
    recurrenceEndDate,
    recurrenceFrequency,
    recurrenceOccurrences,
    reminderMinutesBefore,
    selectedAccount,
    sendInvitations,
    setAddConferencing,
    setAttendees,
    setConnectedAccountId,
    setDescription,
    setEndsAt,
    setLocation,
    setSendInvitations,
    setTimeZone,
    setTitle,
    setEventType,
    setOwnerId,
    setReminderMinutesBefore,
    setRecurrenceEndDate,
    setRecurrenceFrequency,
    setRecurrenceOccurrences,
    targets,
    timeZone,
  };
};
