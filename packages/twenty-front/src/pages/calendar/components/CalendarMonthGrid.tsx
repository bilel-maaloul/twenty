import { CalendarEventNotSharedContent } from '@/activities/calendar/components/CalendarEventNotSharedContent';
import { useUserTimezone } from '@/ui/input/components/internal/date/hooks/useUserTimezone';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Temporal } from 'temporal-polyfill';
import {
  isFieldValueRestricted,
  isPlainDateInSameMonth,
} from 'twenty-shared/utils';
import { IconChevronLeft, IconChevronRight } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';
import { formatToHumanReadableTime } from '~/utils/format/formatDate';

export type CalendarPageCalendarEvent = {
  calendarEventParticipants?: Array<{
    displayName?: string | null;
    handle?: string | null;
    id: string;
  }>;
  __typename: 'CalendarEvent';
  calendarEventTargets?: Array<{
    id: string;
    targetCompany?: { id: string } | null;
    targetOpportunity?: { id: string } | null;
    targetPerson?: { id: string } | null;
    targetTask?: { id: string } | null;
  }>;
  eventType?: string | null;
  endsAt?: string | null;
  id: string;
  isCanceled: boolean;
  isFullDay: boolean;
  owner?: { id: string } | null;
  startsAt: string;
  title: string | null;
};

type CalendarMonthGridProps = {
  calendarEvents: CalendarPageCalendarEvent[];
  days: Temporal.PlainDate[][];
  monthLabel: string;
  selectedDate: Temporal.PlainDate;
  userTimezone: string;
  weekDayLabels: string[];
  onCalendarEventClick: (calendarEventId: string) => void;
  onCurrentMonth: () => void;
  onDayClick: (day: Temporal.PlainDate) => void;
  onDateChange: (date: Temporal.PlainDate) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
};

type CalendarPickerStep = 'year' | 'month' | 'day';

const CALENDAR_PICKER_YEAR_PAGE_SIZE = 12;

const getDateWithSafeDay = ({
  date,
  day = date.day,
  month = date.month,
  year = date.year,
}: {
  date: Temporal.PlainDate;
  day?: number;
  month?: number;
  year?: number;
}) => {
  const firstDayOfMonth = Temporal.PlainDate.from({ year, month, day: 1 });

  return firstDayOfMonth.with({
    day: Math.min(day, firstDayOfMonth.daysInMonth),
  });
};

const getCalendarPickerDays = (
  date: Temporal.PlainDate,
  weekStartsOnDayOfWeek: number,
) => {
  const firstDayOfMonth = date.with({ day: 1 });
  const daysBeforeFirstDay =
    (firstDayOfMonth.dayOfWeek - weekStartsOnDayOfWeek + 7) % 7;
  const firstCalendarDay = firstDayOfMonth.subtract({
    days: daysBeforeFirstDay,
  });

  return Array.from({ length: 42 }, (_, index) =>
    firstCalendarDay.add({ days: index }),
  );
};

const MAX_VISIBLE_EVENTS_PER_DAY = 3;

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  overflow: auto;
  padding: 0 ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[6]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    padding: 0 ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 32px;
  position: relative;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    justify-content: space-between;
  }
`;

const StyledMonthNavigation = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledMonthPickerButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  justify-content: center;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledMonthPickerContainer = styled.div`
  position: relative;
`;

const StyledCurrentMonthButton = styled.div`
  position: absolute;
  right: 0;
  top: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    position: static;
  }
`;

const StyledPicker = styled.div`
  background: ${themeCssVariables.background.primary};
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPickerPopover = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  left: 50%;
  position: absolute;
  top: calc(100% + ${themeCssVariables.spacing[2]});
  transform: translateX(-50%);
  width: 320px;
  max-width: calc(100vw - ${themeCssVariables.spacing[6]});
  z-index: 1;
`;

const StyledPickerSelection = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding-bottom: ${themeCssVariables.spacing[3]};
`;

const StyledPickerSelectionLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledPickerSelectionValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledPickerStepHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  min-height: 32px;
`;

const StyledPickerStepTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledPickerBackButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
    color: ${themeCssVariables.font.color.primary};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledPickerNavigation = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPickerGrid = styled.div<{ columns: number }>`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
  grid-template-columns: repeat(${({ columns }) => columns}, minmax(0, 1fr));
`;

const StyledPickerOption = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected ? themeCssVariables.color.blue : 'transparent'};
  border: 1px solid
    ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.font.color.inverted
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]};

  &:hover {
    background: ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.color.blue
        : themeCssVariables.background.transparent.light};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledPickerWeekDay = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[1]};
  text-align: center;
`;

const StyledPickerDayPlaceholder = styled.span`
  min-height: 32px;
`;

const StyledTableContainer = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: auto;
`;

const StyledTable = styled.table`
  border-collapse: separate;
  border-spacing: 0;
  height: 100%;
  min-width: 840px;
  table-layout: fixed;
  width: 100%;
`;

const StyledWeekDay = styled.th`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
`;

const StyledDayCell = styled.td<{ isOtherMonth: boolean }>`
  background: ${({ isOtherMonth }) =>
    isOtherMonth
      ? themeCssVariables.background.secondary
      : themeCssVariables.background.primary};
  box-sizing: border-box;
  height: 1px;
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]};
  vertical-align: top;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: -2px;
  }

  &:not(:last-child) {
    border-right: 1px solid ${themeCssVariables.border.color.light};
  }

  tr:not(:last-child) & {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledDayHeader = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledDayNumber = styled.time<{
  isOtherMonth: boolean;
  isToday: boolean;
}>`
  align-items: center;
  background: ${({ isToday }) =>
    isToday ? themeCssVariables.color.blue : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isOtherMonth, isToday }) =>
    isToday
      ? themeCssVariables.font.color.inverted
      : isOtherMonth
        ? themeCssVariables.font.color.light
        : themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${({ isToday }) =>
    isToday
      ? themeCssVariables.font.weight.medium
      : themeCssVariables.font.weight.regular};
  height: ${themeCssVariables.spacing[5]};
  justify-content: center;
  width: ${themeCssVariables.spacing[5]};
`;

const StyledEvents = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing['0.5']};
`;

const StyledEventButton = styled.button`
  align-items: flex-start;
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing['0.5']};
  min-width: 0;
  padding: ${themeCssVariables.spacing['0.5']};
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledEventDetails = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing['0.5']};
  min-width: 0;
  width: 100%;
`;

const StyledEventTime = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
`;

const StyledEventType = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xxs};
  text-transform: capitalize;
`;

const StyledRelatedMarker = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
`;

const StyledEventParticipantCount = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
`;

const StyledEventTitle = styled.span<{ isCanceled: boolean }>`
  overflow: hidden;
  text-decoration: ${({ isCanceled }) =>
    isCanceled ? 'line-through' : 'none'};
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const StyledMoreEvents = styled.button`
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing['0.5']};
  text-align: left;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const getCalendarEventDateKey = (
  calendarEvent: CalendarPageCalendarEvent,
  userTimezone: string,
) => {
  try {
    if (calendarEvent.isFullDay) {
      return Temporal.PlainDate.from(
        calendarEvent.startsAt.slice(0, 10),
      ).toString();
    }

    return Temporal.Instant.from(calendarEvent.startsAt)
      .toZonedDateTimeISO(userTimezone)
      .toPlainDate()
      .toString();
  } catch {
    return null;
  }
};

const getCalendarEventTimeLabel = (
  calendarEvent: CalendarPageCalendarEvent,
  userTimezone: string,
) => {
  if (calendarEvent.isFullDay) {
    return t`All day`;
  }

  const startTimeLabel = formatToHumanReadableTime(
    calendarEvent.startsAt,
    userTimezone,
  );

  if (!calendarEvent.endsAt) {
    return startTimeLabel;
  }

  return `${startTimeLabel} → ${formatToHumanReadableTime(
    calendarEvent.endsAt,
    userTimezone,
  )}`;
};

export const CalendarMonthGrid = ({
  calendarEvents,
  days,
  monthLabel,
  selectedDate,
  userTimezone,
  weekDayLabels,
  onCalendarEventClick,
  onCurrentMonth,
  onDayClick,
  onDateChange,
  onNextMonth,
  onPreviousMonth,
}: CalendarMonthGridProps) => {
  const { userTimezone: currentUserTimezone } = useUserTimezone();
  const today = Temporal.Now.plainDateISO(currentUserTimezone);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState(selectedDate);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<CalendarPickerStep>('year');
  const [yearPageStart, setYearPageStart] = useState(
    Math.floor(selectedDate.year / CALENDAR_PICKER_YEAR_PAGE_SIZE) *
      CALENDAR_PICKER_YEAR_PAGE_SIZE,
  );
  const pickerDayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !pickerContainerRef.current?.contains(target)
      ) {
        setIsPickerOpen(false);
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPickerOpen]);

  const weekStartsOnDayOfWeek = days[0]?.[0]?.dayOfWeek ?? 1;
  const pickerDays = useMemo(
    () => getCalendarPickerDays(pickerDate, weekStartsOnDayOfWeek),
    [pickerDate, weekStartsOnDayOfWeek],
  );

  const pickerYears = Array.from(
    { length: CALENDAR_PICKER_YEAR_PAGE_SIZE },
    (_, index) => yearPageStart + index,
  );

  const pickerMonthLabels = Array.from({ length: 12 }, (_, index) =>
    Temporal.PlainDate.from({
      year: pickerDate.year,
      month: index + 1,
      day: 1,
    }).toLocaleString(undefined, { month: 'long' }),
  );

  const handlePickerYearSelect = (year: number) => {
    const nextDate = getDateWithSafeDay({ date: pickerDate, year });

    setPickerDate(nextDate);
    onDateChange(nextDate);
    setPickerStep('month');
  };

  const handlePickerMonthSelect = (month: number) => {
    const nextDate = getDateWithSafeDay({ date: pickerDate, month });

    setPickerDate(nextDate);
    onDateChange(nextDate);
    setPickerStep('day');
  };

  const handlePickerDaySelect = (day: Temporal.PlainDate) => {
    setPickerDate(day);
    onDateChange(day);
    setIsPickerOpen(false);
  };

  const handlePickerDayKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    day: Temporal.PlainDate,
  ) => {
    const keyToDayOffset: Record<string, number> = {
      ArrowDown: 7,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
    };
    const dayOffset = keyToDayOffset[event.key];

    if (dayOffset === undefined) {
      return;
    }

    const nextDay = day.add({ days: dayOffset });
    const nextDayButton = pickerDayButtonRefs.current[nextDay.toString()];

    if (nextDayButton) {
      event.preventDefault();
      nextDayButton.focus();
    }
  };

  const calendarEventsByDate = useMemo(() => {
    const eventsByDate = new Map<string, CalendarPageCalendarEvent[]>();

    for (const calendarEvent of calendarEvents) {
      const dateKey = getCalendarEventDateKey(calendarEvent, userTimezone);

      if (dateKey === null) {
        continue;
      }

      const calendarEventsForDate = eventsByDate.get(dateKey) ?? [];
      calendarEventsForDate.push(calendarEvent);
      eventsByDate.set(dateKey, calendarEventsForDate);
    }

    for (const calendarEventsForDate of eventsByDate.values()) {
      calendarEventsForDate.sort((firstEvent, secondEvent) =>
        firstEvent.startsAt.localeCompare(secondEvent.startsAt),
      );
    }

    return eventsByDate;
  }, [calendarEvents, userTimezone]);

  return (
    <StyledContainer>
      <StyledToolbar>
        <StyledMonthNavigation>
          <Button
            ariaLabel={t`Previous month`}
            size="small"
            variant="tertiary"
            Icon={IconChevronLeft}
            onClick={onPreviousMonth}
          />
          <StyledMonthPickerContainer ref={pickerContainerRef}>
            <StyledMonthPickerButton
              aria-expanded={isPickerOpen}
              aria-haspopup="dialog"
              aria-label={t`Choose a date, currently ${monthLabel}`}
              type="button"
              onClick={() => {
                setPickerDate(selectedDate);
                setPickerStep('year');
                setYearPageStart(
                  Math.floor(
                    selectedDate.year / CALENDAR_PICKER_YEAR_PAGE_SIZE,
                  ) * CALENDAR_PICKER_YEAR_PAGE_SIZE,
                );
                setIsPickerOpen((currentIsPickerOpen) => !currentIsPickerOpen);
              }}
            >
              <span aria-live="polite">{monthLabel}</span>
            </StyledMonthPickerButton>
            {isPickerOpen && (
              <StyledPickerPopover>
                <StyledPicker
                  aria-label={t`Choose calendar date`}
                  role="dialog"
                >
                  <StyledPickerSelection>
                    <StyledPickerSelectionLabel>
                      {t`Selected date`}
                    </StyledPickerSelectionLabel>
                    <StyledPickerSelectionValue>
                      {pickerDate.toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </StyledPickerSelectionValue>
                  </StyledPickerSelection>
                  {pickerStep === 'year' && (
                    <>
                      <StyledPickerStepHeader>
                        <StyledPickerStepTitle>
                          {t`Choose a year`}
                        </StyledPickerStepTitle>
                        <StyledPickerNavigation>
                          <Button
                            ariaLabel={t`Previous years`}
                            Icon={IconChevronLeft}
                            size="small"
                            variant="tertiary"
                            onClick={() =>
                              setYearPageStart(
                                (currentYearPageStart) =>
                                  currentYearPageStart -
                                  CALENDAR_PICKER_YEAR_PAGE_SIZE,
                              )
                            }
                          />
                          <Button
                            ariaLabel={t`Next years`}
                            Icon={IconChevronRight}
                            size="small"
                            variant="tertiary"
                            onClick={() =>
                              setYearPageStart(
                                (currentYearPageStart) =>
                                  currentYearPageStart +
                                  CALENDAR_PICKER_YEAR_PAGE_SIZE,
                              )
                            }
                          />
                        </StyledPickerNavigation>
                      </StyledPickerStepHeader>
                      <StyledPickerGrid columns={3}>
                        {pickerYears.map((year) => (
                          <StyledPickerOption
                            key={year}
                            isSelected={year === pickerDate.year}
                            type="button"
                            aria-pressed={year === pickerDate.year}
                            onClick={() => handlePickerYearSelect(year)}
                          >
                            {year}
                          </StyledPickerOption>
                        ))}
                      </StyledPickerGrid>
                    </>
                  )}
                  {pickerStep === 'month' && (
                    <>
                      <StyledPickerStepHeader>
                        <StyledPickerBackButton
                          aria-label={t`Back to year selection`}
                          type="button"
                          onClick={() => setPickerStep('year')}
                        >
                          <IconChevronLeft size={14} />
                          {pickerDate.year}
                        </StyledPickerBackButton>
                        <StyledPickerStepTitle>
                          {t`Choose a month`}
                        </StyledPickerStepTitle>
                        <span />
                      </StyledPickerStepHeader>
                      <StyledPickerGrid columns={3}>
                        {pickerMonthLabels.map((monthName, index) => {
                          const month = index + 1;

                          return (
                            <StyledPickerOption
                              key={month}
                              isSelected={month === pickerDate.month}
                              type="button"
                              aria-pressed={month === pickerDate.month}
                              onClick={() => handlePickerMonthSelect(month)}
                            >
                              {monthName}
                            </StyledPickerOption>
                          );
                        })}
                      </StyledPickerGrid>
                    </>
                  )}
                  {pickerStep === 'day' && (
                    <>
                      <StyledPickerStepHeader>
                        <StyledPickerBackButton
                          aria-label={t`Back to month selection`}
                          type="button"
                          onClick={() => setPickerStep('month')}
                        >
                          <IconChevronLeft size={14} />
                          {pickerDate.toLocaleString(undefined, {
                            month: 'long',
                          })}
                        </StyledPickerBackButton>
                        <StyledPickerStepTitle>
                          {t`Choose a day`}
                        </StyledPickerStepTitle>
                        <span />
                      </StyledPickerStepHeader>
                      <StyledPickerGrid columns={7}>
                        {weekDayLabels.map((weekDayLabel) => (
                          <StyledPickerWeekDay key={weekDayLabel}>
                            {weekDayLabel}
                          </StyledPickerWeekDay>
                        ))}
                        {pickerDays.map((day) => {
                          const isPickerDayInMonth = isPlainDateInSameMonth(
                            day,
                            pickerDate,
                          );

                          if (!isPickerDayInMonth) {
                            return (
                              <StyledPickerDayPlaceholder
                                key={day.toString()}
                                aria-hidden="true"
                              />
                            );
                          }

                          const isSelected = day.equals(pickerDate);

                          return (
                            <StyledPickerOption
                              key={day.toString()}
                              ref={(element) => {
                                pickerDayButtonRefs.current[day.toString()] =
                                  element;
                              }}
                              aria-label={day.toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                              aria-pressed={isSelected}
                              isSelected={isSelected}
                              type="button"
                              onClick={() => handlePickerDaySelect(day)}
                              onKeyDown={(event) =>
                                handlePickerDayKeyDown(event, day)
                              }
                            >
                              {day.day}
                            </StyledPickerOption>
                          );
                        })}
                      </StyledPickerGrid>
                    </>
                  )}
                </StyledPicker>
              </StyledPickerPopover>
            )}
          </StyledMonthPickerContainer>
          <Button
            ariaLabel={t`Next month`}
            size="small"
            variant="tertiary"
            Icon={IconChevronRight}
            onClick={onNextMonth}
          />
        </StyledMonthNavigation>
        <StyledCurrentMonthButton>
          <Button
            size="small"
            title={t`Today`}
            variant="tertiary"
            onClick={onCurrentMonth}
          />
        </StyledCurrentMonthButton>
      </StyledToolbar>
      <StyledTableContainer>
        <StyledTable>
          <thead>
            <tr>
              {weekDayLabels.map((weekDayLabel) => (
                <StyledWeekDay key={weekDayLabel} scope="col">
                  {weekDayLabel}
                </StyledWeekDay>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((week) => (
              <tr key={week[0].toString()}>
                {week.map((day) => {
                  const isOtherMonth = !isPlainDateInSameMonth(
                    day,
                    selectedDate,
                  );
                  const calendarEventsForDay =
                    calendarEventsByDate.get(day.toString()) ?? [];
                  const isToday = day.equals(today);

                  return (
                    <StyledDayCell
                      key={day.toString()}
                      aria-label={day.toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        weekday: 'long',
                        year: 'numeric',
                      })}
                      isOtherMonth={isOtherMonth}
                      tabIndex={0}
                      onClick={() => onDayClick(day)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onDayClick(day);
                        }
                      }}
                    >
                      <StyledDayHeader>
                        <StyledDayNumber
                          dateTime={day.toString()}
                          isOtherMonth={isOtherMonth}
                          isToday={isToday}
                        >
                          {day.day}
                        </StyledDayNumber>
                      </StyledDayHeader>
                      <StyledEvents>
                        {calendarEventsForDay
                          .slice(
                            0,
                            expandedDayKey === day.toString()
                              ? calendarEventsForDay.length
                              : MAX_VISIBLE_EVENTS_PER_DAY,
                          )
                          .map((calendarEvent) => {
                            if (isFieldValueRestricted(calendarEvent.title)) {
                              return (
                                <CalendarEventNotSharedContent
                                  key={calendarEvent.id}
                                />
                              );
                            }

                            const eventTitle =
                              calendarEvent.title ?? t`Untitled event`;
                            const eventTimeLabel = getCalendarEventTimeLabel(
                              calendarEvent,
                              userTimezone,
                            );

                            return (
                              <StyledEventButton
                                key={calendarEvent.id}
                                aria-label={t`Open ${eventTitle} at ${eventTimeLabel}`}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCalendarEventClick(calendarEvent.id);
                                }}
                              >
                                <StyledEventTitle
                                  isCanceled={calendarEvent.isCanceled}
                                >
                                  {eventTitle}
                                </StyledEventTitle>
                                <StyledEventDetails>
                                  {calendarEvent.eventType && (
                                    <StyledEventType>
                                      {calendarEvent.eventType.toLowerCase()}
                                    </StyledEventType>
                                  )}
                                  <StyledEventTime>
                                    {eventTimeLabel}
                                  </StyledEventTime>
                                  {calendarEvent.calendarEventParticipants &&
                                    calendarEvent.calendarEventParticipants
                                      .length > 0 && (
                                      <StyledEventParticipantCount
                                        aria-label={t`${calendarEvent.calendarEventParticipants.length} participants`}
                                      >
                                        ·
                                        {
                                          calendarEvent
                                            .calendarEventParticipants.length
                                        }
                                      </StyledEventParticipantCount>
                                    )}
                                  {calendarEvent.calendarEventTargets &&
                                    calendarEvent.calendarEventTargets.length >
                                      0 && (
                                      <StyledRelatedMarker
                                        aria-label={t`Related CRM records`}
                                        title={t`Related CRM records`}
                                      >
                                        •
                                      </StyledRelatedMarker>
                                    )}
                                </StyledEventDetails>
                              </StyledEventButton>
                            );
                          })}
                        {calendarEventsForDay.length >
                          MAX_VISIBLE_EVENTS_PER_DAY && (
                          <StyledMoreEvents
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedDayKey((currentDayKey) =>
                                currentDayKey === day.toString()
                                  ? null
                                  : day.toString(),
                              );
                            }}
                          >
                            {expandedDayKey === day.toString()
                              ? t`Show fewer`
                              : t`+${calendarEventsForDay.length - MAX_VISIBLE_EVENTS_PER_DAY} more`}
                          </StyledMoreEvents>
                        )}
                      </StyledEvents>
                    </StyledDayCell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </StyledTable>
      </StyledTableContainer>
    </StyledContainer>
  );
};
