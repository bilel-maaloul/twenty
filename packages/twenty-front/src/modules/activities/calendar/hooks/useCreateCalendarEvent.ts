import { CREATE_CALENDAR_EVENT } from '@/activities/calendar/graphql/mutations/createCalendarEvent';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';
import {
  type CreateCalendarEventInput,
  type CreateCalendarEventOutput,
  type MutationCreateCalendarEventArgs,
} from '~/generated-metadata/graphql';

export const useCreateCalendarEvent = () => {
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();

  const [createCalendarEventMutation, { loading }] = useMutation<
    { createCalendarEvent: CreateCalendarEventOutput },
    MutationCreateCalendarEventArgs
  >(CREATE_CALENDAR_EVENT);

  const createCalendarEvent = useCallback(
    async (input: CreateCalendarEventInput) => {
      try {
        const result = await createCalendarEventMutation({
          variables: { input },
        });

        const calendarEvent = result.data?.createCalendarEvent;

        if (!calendarEvent?.success || !calendarEvent.calendarEventId) {
          enqueueErrorSnackBar({
            message: calendarEvent?.error ?? t`Failed to create calendar event`,
          });

          return { success: false };
        }

        enqueueSuccessSnackBar({
          message: t`Calendar event created successfully`,
        });

        return {
          success: true,
          calendarEventId: calendarEvent.calendarEventId,
        };
      } catch {
        enqueueErrorSnackBar({
          message: t`Failed to create calendar event`,
        });

        return { success: false };
      }
    },
    [createCalendarEventMutation, enqueueErrorSnackBar, enqueueSuccessSnackBar],
  );

  return { createCalendarEvent, loading };
};
