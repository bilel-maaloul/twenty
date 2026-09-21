import { CalendarEventNotSharedContent } from '@/activities/calendar/components/CalendarEventNotSharedContent';
import { useUserTimezone } from '@/ui/input/components/internal/date/hooks/useUserTimezone';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';
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
  __typename: 'CalendarEvent';
  id: string;
  isCanceled: boolean;
  isFullDay: boolean;
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
  onNextMonth: () => void;
  onPreviousMonth: () => void;
};

const MAX_VISIBLE_EVENTS_PER_DAY = 3;

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[4]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    padding: ${themeCssVariables.spacing[2]};
  }
`;

const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledMonthLabel = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledNavigationControls = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTableContainer = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  min-height: 0;
  overflow: auto;
`;

const StyledTable = styled.table`
  border-collapse: separate;
  border-spacing: 0;
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
  text-align: right;
`;

const StyledDayCell = styled.td<{ isOtherMonth: boolean }>`
  background: ${({ isOtherMonth }) =>
    isOtherMonth
      ? themeCssVariables.background.secondary
      : themeCssVariables.background.primary};
  box-sizing: border-box;
  height: 132px;
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
  align-items: baseline;
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
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

const StyledEventTime = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  flex-shrink: 0;
`;

const StyledEventTitle = styled.span<{ isCanceled: boolean }>`
  overflow: hidden;
  text-decoration: ${({ isCanceled }) =>
    isCanceled ? 'line-through' : 'none'};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMoreEvents = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: block;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing['0.5']};
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
) =>
  calendarEvent.isFullDay
    ? t`All day`
    : formatToHumanReadableTime(calendarEvent.startsAt, userTimezone);

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
  onNextMonth,
  onPreviousMonth,
}: CalendarMonthGridProps) => {
  const { userTimezone: currentUserTimezone } = useUserTimezone();
  const today = Temporal.Now.plainDateISO(currentUserTimezone);

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
        <StyledMonthLabel aria-live="polite">{monthLabel}</StyledMonthLabel>
        <StyledNavigationControls>
          <Button
            ariaLabel={t`Previous month`}
            size="small"
            variant="tertiary"
            Icon={IconChevronLeft}
            onClick={onPreviousMonth}
          />
          <Button
            size="small"
            title={t`Today`}
            variant="tertiary"
            onClick={onCurrentMonth}
          />
          <Button
            ariaLabel={t`Next month`}
            size="small"
            variant="tertiary"
            Icon={IconChevronRight}
            onClick={onNextMonth}
          />
        </StyledNavigationControls>
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
                          .slice(0, MAX_VISIBLE_EVENTS_PER_DAY)
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
                                <StyledEventTime>
                                  {eventTimeLabel}
                                </StyledEventTime>
                                <StyledEventTitle
                                  isCanceled={calendarEvent.isCanceled}
                                >
                                  {eventTitle}
                                </StyledEventTitle>
                              </StyledEventButton>
                            );
                          })}
                        {calendarEventsForDay.length >
                          MAX_VISIBLE_EVENTS_PER_DAY && (
                          <StyledMoreEvents>
                            {t`+${calendarEventsForDay.length - MAX_VISIBLE_EVENTS_PER_DAY} more`}
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
