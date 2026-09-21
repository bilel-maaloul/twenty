import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from 'temporal-polyfill';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import {
  CalendarMonthGrid,
  type CalendarPageCalendarEvent,
} from '~/pages/calendar/components/CalendarMonthGrid';

jest.mock('transliteration', () => ({
  slugify: (value: string) => value,
  transliterate: (value: string) => value,
}));

const DAYS = [
  [
    Temporal.PlainDate.from('2026-07-13'),
    Temporal.PlainDate.from('2026-07-14'),
    Temporal.PlainDate.from('2026-07-15'),
    Temporal.PlainDate.from('2026-07-16'),
    Temporal.PlainDate.from('2026-07-17'),
    Temporal.PlainDate.from('2026-07-18'),
    Temporal.PlainDate.from('2026-07-19'),
  ],
];

const CALENDAR_EVENT = {
  __typename: 'CalendarEvent',
  id: 'calendar-event-id',
  isCanceled: false,
  isFullDay: false,
  startsAt: '2026-07-15T10:00:00.000Z',
  title: 'Product review',
} satisfies CalendarPageCalendarEvent;

const renderCalendarMonthGrid = ({
  calendarEvents = [CALENDAR_EVENT],
  onCalendarEventClick = jest.fn(),
  onCurrentMonth = jest.fn(),
  onDayClick = jest.fn(),
  onNextMonth = jest.fn(),
  onPreviousMonth = jest.fn(),
}: Partial<{
  calendarEvents: CalendarPageCalendarEvent[];
  onCalendarEventClick: (calendarEventId: string) => void;
  onCurrentMonth: () => void;
  onDayClick: (day: Temporal.PlainDate) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
}> = {}) => {
  render(
    <ThemeProvider colorScheme="light">
      <CalendarMonthGrid
        calendarEvents={calendarEvents}
        days={DAYS}
        monthLabel="July 2026"
        selectedDate={Temporal.PlainDate.from('2026-07-15')}
        userTimezone="UTC"
        weekDayLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
        onCalendarEventClick={onCalendarEventClick}
        onCurrentMonth={onCurrentMonth}
        onDayClick={onDayClick}
        onNextMonth={onNextMonth}
        onPreviousMonth={onPreviousMonth}
      />
    </ThemeProvider>,
  );

  return {
    onCalendarEventClick,
    onCurrentMonth,
    onDayClick,
    onNextMonth,
    onPreviousMonth,
  };
};

describe('CalendarMonthGrid', () => {
  it('renders weekday headings and calendar events in their date cells', () => {
    renderCalendarMonthGrid();

    expect(screen.getByRole('columnheader', { name: 'Mon' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Sun' })).toBeVisible();
    expect(screen.getByText('Product review')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Open Product review at/i }),
    ).toBeVisible();
  });

  it('opens existing calendar event details when an event is clicked', async () => {
    const user = userEvent.setup();
    const { onCalendarEventClick } = renderCalendarMonthGrid();

    await user.click(
      screen.getByRole('button', { name: /Open Product review at/i }),
    );

    expect(onCalendarEventClick).toHaveBeenCalledWith('calendar-event-id');
  });

  it('uses the existing month navigation controls', async () => {
    const user = userEvent.setup();
    const { onCurrentMonth, onNextMonth, onPreviousMonth } =
      renderCalendarMonthGrid();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: /Today/ }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));

    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onCurrentMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it('opens the composer when a date cell is clicked', async () => {
    const user = userEvent.setup();
    const { onDayClick } = renderCalendarMonthGrid({ calendarEvents: [] });

    const july15Cell = screen
      .getAllByRole('cell')
      .find((cell) => cell.querySelector('time')?.dateTime === '2026-07-15');

    expect(july15Cell).toBeDefined();

    await user.click(july15Cell as HTMLElement);

    expect(onDayClick).toHaveBeenCalledWith(
      Temporal.PlainDate.from('2026-07-15'),
    );
  });

  it('indicates when a date contains more events than it displays', () => {
    renderCalendarMonthGrid({
      calendarEvents: Array.from({ length: 4 }, (_, index) => ({
        ...CALENDAR_EVENT,
        id: `calendar-event-id-${index}`,
        title: `Product review ${index}`,
      })),
    });

    expect(screen.getByText('+1 more')).toBeVisible();
  });
});
