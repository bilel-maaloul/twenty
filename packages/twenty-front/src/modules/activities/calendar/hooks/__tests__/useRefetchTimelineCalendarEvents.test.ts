import { renderHook } from '@testing-library/react';

import { TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE } from '@/activities/calendar/constants/Calendar';
import { getTimelineCalendarEventsFromObjectRecord } from '@/activities/calendar/graphql/queries/getTimelineCalendarEventsFromObjectRecord';
import { useRefetchTimelineCalendarEvents } from '@/activities/calendar/hooks/useRefetchTimelineCalendarEvents';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

describe('useRefetchTimelineCalendarEvents', () => {
  const refetchQueries = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useApolloCoreClient as jest.Mock).mockReturnValue({ refetchQueries });
  });

  it('refetches the active timeline operation with its original variables', async () => {
    const { result } = renderHook(() => useRefetchTimelineCalendarEvents());

    await result.current.refetchTimelineCalendarEvents({
      objectNameSingular: 'company',
      recordId: 'company-id',
    });

    expect(refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        include: [getTimelineCalendarEventsFromObjectRecord],
      }),
    );

    const { onQueryUpdated } = refetchQueries.mock.calls[0][0];
    const refetch = jest.fn().mockResolvedValue(undefined);

    await onQueryUpdated({
      variables: {
        objectNameSingular: 'company',
        recordId: 'company-id',
        page: 1,
        pageSize: TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
      },
      refetch,
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(
      onQueryUpdated({
        variables: {
          objectNameSingular: 'company',
          recordId: 'another-company-id',
          page: 1,
          pageSize: TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE,
        },
        refetch,
      }),
    ).toBe(false);
  });
});
