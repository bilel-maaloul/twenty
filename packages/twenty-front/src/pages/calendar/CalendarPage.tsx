import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { useRecordCalendarDaysRange } from '@/object-record/record-calendar/hooks/useRecordCalendarDaysRange';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { RecordIndexEmptyStateDisplay } from '@/object-record/record-index/components/RecordIndexEmptyStateDisplay';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { getMissingCreateCalendarEventScopes } from '@/accounts/utils/hasMissingCreateCalendarEventScopes';
import { isCalendarCreationEnabledForAccount } from '@/activities/calendar/utils/isCalendarCreationEnabledForAccount';
import { useMyConnectedAccounts } from '@/settings/accounts/hooks/useMyConnectedAccounts';
import { useOpenCalendarEventInSidePanel } from '@/side-panel/hooks/useOpenCalendarEventInSidePanel';
import { useOpenComposeCalendarEventInSidePanel } from '@/side-panel/hooks/useOpenComposeCalendarEventInSidePanel';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useUserTimezone } from '@/ui/input/components/internal/date/hooks/useUserTimezone';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useMemo, useState } from 'react';
import { Temporal } from 'temporal-polyfill';
import {
  CoreObjectNameSingular,
  type RecordGqlOperationFilter,
} from 'twenty-shared/types';
import { turnPlainDateIntoUserTimeZoneInstantString } from 'twenty-shared/utils';
import { IconCalendarEvent, IconPlus, IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Select } from '@/ui/input/components/Select';
import {
  PermissionFlagType,
  ViewCalendarLayout,
} from '~/generated-metadata/graphql';
import {
  CalendarMonthGrid,
  type CalendarPageCalendarEvent,
} from '~/pages/calendar/components/CalendarMonthGrid';

const CALENDAR_EVENT_RECORD_GQL_FIELDS = {
  calendarEventTargets: {
    id: true,
    targetCompany: { id: true },
    targetOpportunity: { id: true },
    targetPerson: { id: true },
    targetTask: { id: true },
  },
  calendarEventParticipants: { id: true, displayName: true, handle: true },
  eventType: true,
  id: true,
  isCanceled: true,
  isFullDay: true,
  owner: { id: true },
  startsAt: true,
  title: true,
} as const;

const StyledContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

const StyledEmptyNotice = styled.div`
  align-items: center;
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  text-align: center;
`;

const StyledFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]} 0;
`;

type CalendarTargetObjectName =
  | CoreObjectNameSingular.Company
  | CoreObjectNameSingular.Opportunity
  | CoreObjectNameSingular.Person
  | CoreObjectNameSingular.Task;

export const CalendarPage = () => {
  const { t } = useLingui();
  const { userTimezone } = useUserTimezone();
  const { accounts } = useMyConnectedAccounts();
  const canCreateCalendarEvent = useHasPermissionFlag(
    PermissionFlagType.CREATE_CALENDAR_EVENT_TOOL,
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    Temporal.Now.plainDateISO(userTimezone),
  );
  const [selectedEventType, setSelectedEventType] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedTargetObjectName, setSelectedTargetObjectName] = useState<
    CalendarTargetObjectName | ''
  >('');
  const [selectedTargetRecordId, setSelectedTargetRecordId] = useState<
    string | null
  >(null);
  const { firstDay, lastDay, days, weekDayLabels } = useRecordCalendarDaysRange(
    selectedDate,
    ViewCalendarLayout.MONTH,
  );
  const { openCalendarEventInSidePanel } = useOpenCalendarEventInSidePanel();
  const { openComposeCalendarEventInSidePanel } =
    useOpenComposeCalendarEventInSidePanel();

  const calendarAccounts = useMemo(
    () => accounts.filter(isCalendarCreationEnabledForAccount),
    [accounts],
  );
  const preferredCalendarAccount = useMemo(
    () =>
      calendarAccounts.find(
        (account) => getMissingCreateCalendarEventScopes(account).length === 0,
      ) ?? calendarAccounts[0],
    [calendarAccounts],
  );

  const dateRangeFilter = useMemo(
    () =>
      ({
        and: [
          {
            startsAt: {
              gte: turnPlainDateIntoUserTimeZoneInstantString(
                firstDay,
                userTimezone,
              ),
            },
          },
          {
            startsAt: {
              lt: turnPlainDateIntoUserTimeZoneInstantString(
                lastDay.add({ days: 1 }),
                userTimezone,
              ),
            },
          },
        ],
      }) satisfies RecordGqlOperationFilter,
    [firstDay, lastDay, userTimezone],
  );

  const { records, loading, error, refetch } =
    useFindManyRecords<CalendarPageCalendarEvent>({
      objectNameSingular: CoreObjectNameSingular.CalendarEvent,
      filter: dateRangeFilter,
      orderBy: [{ startsAt: 'AscNullsLast' }],
      limit: 100,
      recordGqlFields: CALENDAR_EVENT_RECORD_GQL_FIELDS,
    });

  const visibleRecords = useMemo(
    () =>
      selectedEventType === ''
        ? records
        : records.filter(
            (calendarEvent) => calendarEvent.eventType === selectedEventType,
          ),
    [records, selectedEventType],
  );

  const recordsMatchingFilters = useMemo(
    () =>
      visibleRecords.filter((calendarEvent) => {
        if (
          selectedOwnerId !== null &&
          calendarEvent.owner?.id !== selectedOwnerId
        ) {
          return false;
        }

        if (
          selectedTargetObjectName === '' ||
          selectedTargetRecordId === null
        ) {
          return true;
        }

        return calendarEvent.calendarEventTargets?.some((target) => {
          switch (selectedTargetObjectName) {
            case CoreObjectNameSingular.Company:
              return target.targetCompany?.id === selectedTargetRecordId;
            case CoreObjectNameSingular.Opportunity:
              return target.targetOpportunity?.id === selectedTargetRecordId;
            case CoreObjectNameSingular.Person:
              return target.targetPerson?.id === selectedTargetRecordId;
            case CoreObjectNameSingular.Task:
              return target.targetTask?.id === selectedTargetRecordId;
          }
        });
      }),
    [
      selectedOwnerId,
      selectedTargetObjectName,
      selectedTargetRecordId,
      visibleRecords,
    ],
  );

  const hasActiveFilter =
    selectedEventType !== '' ||
    selectedOwnerId !== null ||
    selectedTargetObjectName !== '' ||
    selectedTargetRecordId !== null;

  const handleTargetObjectNameChange = (value: string) => {
    setSelectedTargetObjectName(value as CalendarTargetObjectName | '');
    setSelectedTargetRecordId(null);
  };

  const handleCalendarEventCreated = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openCalendarEventComposer = useCallback(
    (date?: Temporal.PlainDate) => {
      openComposeCalendarEventInSidePanel({
        connectedAccountId: preferredCalendarAccount?.id ?? '',
        contextRecord: {
          objectNameSingular: CoreObjectNameSingular.CalendarEvent,
          recordId: '',
        },
        defaultAttendees: '',
        initialDate: date?.toString(),
        onCreated: handleCalendarEventCreated,
        timeZone: userTimezone,
      });
    },
    [
      handleCalendarEventCreated,
      openComposeCalendarEventInSidePanel,
      preferredCalendarAccount?.id,
      userTimezone,
    ],
  );

  const monthLabel = selectedDate.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const handlePreviousMonth = () => {
    setSelectedDate((currentDate) => currentDate.subtract({ months: 1 }));
  };

  const handleNextMonth = () => {
    setSelectedDate((currentDate) => currentDate.add({ months: 1 }));
  };

  const handleCurrentMonth = () => {
    setSelectedDate(Temporal.Now.plainDateISO(userTimezone));
  };

  return (
    <>
      <PageTitle title={t`Calendar`} />
      <PageCardLayout
        header={
          <PageCardHeader
            actionButton={
              canCreateCalendarEvent ? (
                <Button
                  Icon={IconPlus}
                  size="small"
                  title={t`Create event`}
                  variant="secondary"
                  onClick={() => openCalendarEventComposer()}
                />
              ) : undefined
            }
            icon={<IconCalendarEvent />}
            title={t`Calendar`}
          />
        }
      >
        <StyledContent>
          {loading ? (
            <SkeletonLoader withSubSections />
          ) : error ? (
            <RecordIndexEmptyStateDisplay
              animatedPlaceholderType="errorIndex"
              title={t`Something went wrong`}
              subTitle={t`We could not load your calendar events. Please try again later.`}
              ButtonIcon={IconRefresh}
              buttonTitle={t`Retry`}
              onButtonClick={() => void refetch()}
            />
          ) : (
            <>
              <StyledFilters>
                <Select
                  dropdownId="calendar-event-type-filter"
                  value={selectedEventType}
                  options={[
                    { label: t`All event types`, value: '' },
                    { label: t`Meetings`, value: 'MEETING' },
                    { label: t`Calls`, value: 'CALL' },
                    { label: t`Tasks`, value: 'TASK' },
                    { label: t`Appointments`, value: 'APPOINTMENT' },
                    { label: t`Other`, value: 'OTHER' },
                  ]}
                  onChange={setSelectedEventType}
                />
                <FormSingleRecordPicker
                  objectNameSingulars={[CoreObjectNameSingular.WorkspaceMember]}
                  defaultValue={selectedOwnerId}
                  onChange={(value) =>
                    setSelectedOwnerId(typeof value === 'string' ? value : null)
                  }
                  testId="calendar-owner-filter"
                />
                <Select
                  dropdownId="calendar-target-object-filter"
                  value={selectedTargetObjectName}
                  options={[
                    { label: t`All related records`, value: '' },
                    { label: t`Person`, value: CoreObjectNameSingular.Person },
                    {
                      label: t`Company`,
                      value: CoreObjectNameSingular.Company,
                    },
                    {
                      label: t`Opportunity`,
                      value: CoreObjectNameSingular.Opportunity,
                    },
                    { label: t`Task`, value: CoreObjectNameSingular.Task },
                  ]}
                  onChange={handleTargetObjectNameChange}
                />
                {selectedTargetObjectName !== '' && (
                  <FormSingleRecordPicker
                    objectNameSingulars={[selectedTargetObjectName]}
                    defaultValue={selectedTargetRecordId}
                    onChange={(value) =>
                      setSelectedTargetRecordId(
                        typeof value === 'string' ? value : null,
                      )
                    }
                    testId="calendar-target-record-filter"
                  />
                )}
                {hasActiveFilter && (
                  <Button
                    size="small"
                    title={t`Reset filters`}
                    variant="tertiary"
                    onClick={() => {
                      setSelectedEventType('');
                      setSelectedOwnerId(null);
                      setSelectedTargetObjectName('');
                      setSelectedTargetRecordId(null);
                    }}
                  />
                )}
              </StyledFilters>
              <CalendarMonthGrid
                calendarEvents={recordsMatchingFilters}
                days={days}
                monthLabel={monthLabel}
                selectedDate={selectedDate}
                userTimezone={userTimezone}
                weekDayLabels={weekDayLabels}
                onCalendarEventClick={openCalendarEventInSidePanel}
                onCurrentMonth={handleCurrentMonth}
                onDayClick={openCalendarEventComposer}
                onNextMonth={handleNextMonth}
                onPreviousMonth={handlePreviousMonth}
              />
              {recordsMatchingFilters.length === 0 && (
                <StyledEmptyNotice role="status">
                  {t`No events are scheduled for this month.`}
                  {canCreateCalendarEvent && (
                    <Button
                      size="small"
                      title={t`Create event`}
                      variant="tertiary"
                      onClick={() => openCalendarEventComposer()}
                    />
                  )}
                </StyledEmptyNotice>
              )}
            </>
          )}
        </StyledContent>
      </PageCardLayout>
    </>
  );
};
