import { getTimelineCalendarEventsFromObjectRecord } from '@/activities/calendar/graphql/queries/getTimelineCalendarEventsFromObjectRecord';
import { TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE } from '@/activities/calendar/constants/Calendar';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useCallback } from 'react';

type RefetchTimelineCalendarEventsInput = {
  objectNameSingular: string;
  recordId: string;
};

export const useRefetchTimelineCalendarEvents = () => {
  const apolloCoreClient = useApolloCoreClient();

  const refetchTimelineCalendarEvents = useCallback(
    ({ objectNameSingular, recordId }: RefetchTimelineCalendarEventsInput) =>
      apolloCoreClient.refetchQueries({
        include: [getTimelineCalendarEventsFromObjectRecord],
        onQueryUpdated: (observableQuery) => {
          const variables = observableQuery.variables as {
            objectNameSingular?: unknown;
            recordId?: unknown;
            page?: unknown;
            pageSize?: unknown;
          };

          if (
            variables.objectNameSingular !== objectNameSingular ||
            variables.recordId !== recordId ||
            variables.page !== 1 ||
            variables.pageSize !== TIMELINE_CALENDAR_EVENTS_DEFAULT_PAGE_SIZE
          ) {
            return false;
          }

          return observableQuery.refetch();
        },
      }),
    [apolloCoreClient],
  );

  return { refetchTimelineCalendarEvents };
};
