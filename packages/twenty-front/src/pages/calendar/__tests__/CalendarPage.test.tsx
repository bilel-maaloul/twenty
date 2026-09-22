import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Temporal } from 'temporal-polyfill';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { CalendarPage } from '~/pages/calendar/CalendarPage';

jest.mock('transliteration', () => ({
  slugify: (value: string) => value,
  transliterate: (value: string) => value,
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: () => null,
  }),
);

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => true,
}));

jest.mock('@/settings/accounts/hooks/useMyConnectedAccounts', () => ({
  useMyConnectedAccounts: () => ({ accounts: [], loading: false }),
}));

jest.mock(
  '@/object-record/record-calendar/hooks/useRecordCalendarDaysRange',
  () => ({
    useRecordCalendarDaysRange: () => ({
      firstDay: Temporal.PlainDate.from('2026-07-13'),
      lastDay: Temporal.PlainDate.from('2026-07-19'),
      days: [
        [
          Temporal.PlainDate.from('2026-07-13'),
          Temporal.PlainDate.from('2026-07-14'),
          Temporal.PlainDate.from('2026-07-15'),
          Temporal.PlainDate.from('2026-07-16'),
          Temporal.PlainDate.from('2026-07-17'),
          Temporal.PlainDate.from('2026-07-18'),
          Temporal.PlainDate.from('2026-07-19'),
        ],
      ],
      weekDayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    }),
  }),
);

jest.mock('@/ui/input/components/internal/date/hooks/useUserTimezone', () => ({
  useUserTimezone: () => ({ userTimezone: 'UTC' }),
}));

jest.mock('@/side-panel/hooks/useOpenCalendarEventInSidePanel', () => ({
  useOpenCalendarEventInSidePanel: () => ({
    openCalendarEventInSidePanel: jest.fn(),
  }),
}));

const mockOpenComposeCalendarEventInSidePanel = jest.fn();

jest.mock('@/side-panel/hooks/useOpenComposeCalendarEventInSidePanel', () => ({
  useOpenComposeCalendarEventInSidePanel: () => ({
    openComposeCalendarEventInSidePanel:
      mockOpenComposeCalendarEventInSidePanel,
  }),
}));

jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header: React.ReactNode;
  }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({
    actionButton,
    title,
  }: {
    actionButton?: React.ReactNode;
    title: React.ReactNode;
  }) => (
    <header>
      {title}
      {actionButton}
    </header>
  ),
}));

jest.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: () => null,
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading calendar</div>,
}));

jest.mock(
  '@/object-record/record-index/components/RecordIndexEmptyStateDisplay',
  () => ({
    RecordIndexEmptyStateDisplay: ({
      buttonTitle,
      onButtonClick,
      title,
    }: {
      buttonTitle?: string;
      onButtonClick?: () => void;
      title: string;
    }) => (
      <div>
        {title}
        {onButtonClick && (
          <button type="button" onClick={onButtonClick}>
            {buttonTitle}
          </button>
        )}
      </div>
    ),
  }),
);

jest.mock('~/pages/calendar/components/CalendarMonthGrid', () => ({
  CalendarMonthGrid: ({
    calendarEvents,
    onDayClick,
  }: {
    calendarEvents: Array<{ title: string | null }>;
    onDayClick: (day: Temporal.PlainDate) => void;
  }) => (
    <>
      <div data-testid="calendar-month-grid">
        {calendarEvents.map((calendarEvent) => calendarEvent.title).join(',')}
      </div>
      <button
        type="button"
        onClick={() => onDayClick(Temporal.PlainDate.from('2026-07-15'))}
      >
        July 15
      </button>
    </>
  ),
}));

const mockUseFindManyRecords = jest.mocked(useFindManyRecords);

type FindManyRecordsResult = ReturnType<typeof useFindManyRecords>;

const createFindManyRecordsResult = (
  overrides: Partial<
    Pick<FindManyRecordsResult, 'error' | 'loading' | 'records' | 'refetch'>
  > = {},
) =>
  ({
    error: undefined,
    loading: false,
    records: [],
    refetch: jest.fn(),
    ...overrides,
  }) as FindManyRecordsResult;

const renderCalendarPage = () =>
  render(
    <I18nProvider i18n={i18n}>
      <CalendarPage />
    </I18nProvider>,
  );

describe('CalendarPage', () => {
  beforeEach(() => {
    mockUseFindManyRecords.mockReturnValue(createFindManyRecordsResult());
  });

  it('loads CalendarEvent records without a target record context', () => {
    renderCalendarPage();

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: CoreObjectNameSingular.CalendarEvent,
      }),
    );
    expect(screen.getByTestId('calendar-month-grid')).toBeInTheDocument();
    expect(
      screen.getByText('No events are scheduled for this month.'),
    ).toBeInTheDocument();
  });

  it('renders a loading state while calendar events are loading', () => {
    mockUseFindManyRecords.mockReturnValue(
      createFindManyRecordsResult({ loading: true }),
    );

    renderCalendarPage();

    expect(screen.getByText('Loading calendar')).toBeInTheDocument();
  });

  it('renders an error state when calendar events cannot be loaded', () => {
    mockUseFindManyRecords.mockReturnValue(
      createFindManyRecordsResult({ error: new Error('Network error') }),
    );

    renderCalendarPage();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('allows retrying after a calendar load error', async () => {
    const user = userEvent.setup();
    const refetch = jest.fn();

    mockUseFindManyRecords.mockReturnValue(
      createFindManyRecordsResult({
        error: new Error('Network error'),
        refetch,
      }),
    );

    renderCalendarPage();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('opens the existing calendar event composer from the page action', async () => {
    const user = userEvent.setup();

    renderCalendarPage();

    await user.click(
      screen.getAllByRole('button', { name: /Create event/ })[0],
    );

    expect(mockOpenComposeCalendarEventInSidePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        contextRecord: {
          objectNameSingular: CoreObjectNameSingular.CalendarEvent,
          recordId: '',
        },
        defaultAttendees: '',
      }),
    );
  });

  it('opens the composer with the clicked date', async () => {
    const user = userEvent.setup();

    renderCalendarPage();

    await user.click(screen.getByRole('button', { name: 'July 15' }));

    expect(mockOpenComposeCalendarEventInSidePanel).toHaveBeenCalledWith(
      expect.objectContaining({ initialDate: '2026-07-15' }),
    );
  });
});
