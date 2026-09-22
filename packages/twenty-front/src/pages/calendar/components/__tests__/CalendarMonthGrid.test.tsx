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
  eventType: 'MEETING',
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
  onDateChange = jest.fn(),
  onNextMonth = jest.fn(),
  onPreviousMonth = jest.fn(),
}: Partial<{
  calendarEvents: CalendarPageCalendarEvent[];
  onCalendarEventClick: (calendarEventId: string) => void;
  onCurrentMonth: () => void;
  onDayClick: (day: Temporal.PlainDate) => void;
  onDateChange: (date: Temporal.PlainDate) => void;
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
        onDateChange={onDateChange}
        onNextMonth={onNextMonth}
        onPreviousMonth={onPreviousMonth}
      />
    </ThemeProvider>,
  );

  return {
    onCalendarEventClick,
    onCurrentMonth,
    onDayClick,
    onDateChange,
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

  it('selects a year, month, and day from the staged date picker', async () => {
    const user = userEvent.setup();
    const { onDateChange } = renderCalendarMonthGrid();

    await user.click(
      screen.getByRole('button', {
        name: 'Choose a date, currently July 2026',
      }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Choose calendar date' }),
    ).toBeVisible();
    expect(screen.getByText('Choose a year')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '2020' }));

    expect(screen.getByText('Choose a month')).toBeVisible();
    expect(onDateChange).toHaveBeenLastCalledWith(
      Temporal.PlainDate.from('2020-07-15'),
    );

    const marchDate = Temporal.PlainDate.from('2020-03-01');
    const marchLabel = marchDate.toLocaleString(undefined, { month: 'long' });

    await user.click(screen.getByRole('button', { name: marchLabel }));

    expect(screen.getByText('Choose a day')).toBeVisible();
    expect(onDateChange).toHaveBeenLastCalledWith(
      Temporal.PlainDate.from('2020-03-15'),
    );

    const selectedDayLabel = Temporal.PlainDate.from(
      '2020-03-20',
    ).toLocaleString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await user.click(screen.getByRole('button', { name: selectedDayLabel }));

    expect(onDateChange).toHaveBeenLastCalledWith(
      Temporal.PlainDate.from('2020-03-20'),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Choose calendar date' }),
    ).not.toBeInTheDocument();
  });

  it('supports going back to an earlier picker step and dismissing with Escape', async () => {
    const user = userEvent.setup();
    renderCalendarMonthGrid();

    await user.click(
      screen.getByRole('button', {
        name: 'Choose a date, currently July 2026',
      }),
    );
    await user.click(screen.getByRole('button', { name: '2020' }));

    await user.click(
      screen.getByRole('button', { name: 'Back to year selection' }),
    );

    expect(screen.getByText('Choose a year')).toBeVisible();

    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('dialog', { name: 'Choose calendar date' }),
    ).not.toBeInTheDocument();
  });

  it('closes the picker when clicking outside it', async () => {
    const user = userEvent.setup();
    renderCalendarMonthGrid();

    await user.click(
      screen.getByRole('button', {
        name: 'Choose a date, currently July 2026',
      }),
    );

    expect(
      screen.getByRole('dialog', { name: 'Choose calendar date' }),
    ).toBeVisible();

    await user.click(document.body);

    expect(
      screen.queryByRole('dialog', { name: 'Choose calendar date' }),
    ).not.toBeInTheDocument();
  });

  it('moves between days with arrow keys in the day step', async () => {
    const user = userEvent.setup();
    renderCalendarMonthGrid();

    await user.click(
      screen.getByRole('button', {
        name: 'Choose a date, currently July 2026',
      }),
    );
    await user.click(screen.getByRole('button', { name: '2020' }));
    const marchDate = Temporal.PlainDate.from('2020-03-01');
    const marchLabel = marchDate.toLocaleString(undefined, { month: 'long' });

    await user.click(screen.getByRole('button', { name: marchLabel }));

    const selectedDay = screen.getByRole('button', {
      name: Temporal.PlainDate.from('2020-03-15').toLocaleString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });
    selectedDay.focus();

    await user.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(
      screen.getByRole('button', {
        name: Temporal.PlainDate.from('2020-03-16').toLocaleString(undefined, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      }),
    );
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

  it('expands the remaining events for a date', async () => {
    const user = userEvent.setup();

    renderCalendarMonthGrid({
      calendarEvents: Array.from({ length: 4 }, (_, index) => ({
        ...CALENDAR_EVENT,
        id: `calendar-event-id-${index}`,
        title: `Product review ${index}`,
      })),
    });

    await user.click(screen.getByRole('button', { name: '+1 more' }));

    expect(screen.getByText('Product review 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeVisible();
  });

  it('renders event type, participant count, and related-record indication', () => {
    renderCalendarMonthGrid({
      calendarEvents: [
        {
          ...CALENDAR_EVENT,
          calendarEventParticipants: [
            {
              displayName: 'Ari',
              handle: 'ari@example.com',
              id: 'participant-id',
            },
          ],
          calendarEventTargets: [{ id: 'target-id' }],
        },
      ],
    });

    expect(screen.getByText('meeting')).toBeVisible();
    expect(screen.getByLabelText('1 participants')).toBeVisible();
    expect(screen.getByLabelText('Related CRM records')).toBeVisible();
  });
});
