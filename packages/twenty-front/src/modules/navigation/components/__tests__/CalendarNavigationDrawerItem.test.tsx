import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { CalendarNavigationDrawerItem } from '@/navigation/components/CalendarNavigationDrawerItem';

jest.mock('transliteration', () => ({
  slugify: (value: string) => value,
  transliterate: (value: string) => value,
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'calendar-event-object-metadata-id' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canReadObjectRecords: true }),
}));

jest.mock(
  '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem',
  () => {
    const { Link } = jest.requireActual('react-router-dom');

    return {
      NavigationDrawerItem: ({
        active,
        label,
        to,
      }: {
        active?: boolean;
        label: string;
        to: string;
      }) => (
        <Link aria-current={active ? 'page' : undefined} to={to}>
          {label}
        </Link>
      ),
    };
  },
);

const LocationDisplay = () => {
  const { pathname } = useLocation();

  return <output>{pathname}</output>;
};

const renderCalendarNavigationDrawerItem = (initialPath: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={[initialPath]}
      >
        <CalendarNavigationDrawerItem />
        <LocationDisplay />
      </MemoryRouter>
    </I18nProvider>,
  );

describe('CalendarNavigationDrawerItem', () => {
  it('marks Calendar as active for direct /calendar navigation', () => {
    renderCalendarNavigationDrawerItem(AppPath.CalendarPage);

    const calendarLink = screen.getByRole('link', { name: 'Calendar' });

    expect(calendarLink).toHaveAttribute('href', AppPath.CalendarPage);
    expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to /calendar when Calendar is clicked', async () => {
    const user = userEvent.setup();
    renderCalendarNavigationDrawerItem('/objects/tasks');

    const calendarLink = screen.getByRole('link', { name: 'Calendar' });

    expect(calendarLink).not.toHaveAttribute('aria-current');

    await user.click(calendarLink);

    expect(screen.getByRole('status')).toHaveTextContent(AppPath.CalendarPage);
    expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });
});
