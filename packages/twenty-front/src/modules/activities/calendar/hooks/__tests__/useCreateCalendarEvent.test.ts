import { act, renderHook } from '@testing-library/react';

import { useCreateCalendarEvent } from '@/activities/calendar/hooks/useCreateCalendarEvent';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation } from '@apollo/client/react';
import { type CreateCalendarEventInput } from '~/generated-metadata/graphql';

jest.mock('transliteration', () => ({
  slugify: (value: string) => value,
  transliterate: (value: string) => value,
}));

jest.mock('@apollo/client/react');
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar');

describe('useCreateCalendarEvent', () => {
  const createCalendarEventMutation = jest.fn();
  const enqueueErrorSnackBar = jest.fn();
  const enqueueSuccessSnackBar = jest.fn();
  const input: CreateCalendarEventInput = {
    connectedAccountId: 'account-id',
    title: 'Planning session',
    startsAt: '2026-09-22T10:00:00Z',
    endsAt: '2026-09-22T11:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useMutation as jest.Mock).mockReturnValue([
      createCalendarEventMutation,
      { loading: false },
    ]);
    (useSnackBar as jest.Mock).mockReturnValue({
      enqueueErrorSnackBar,
      enqueueSuccessSnackBar,
    });
  });

  it('shows success only when the persisted event id is returned', async () => {
    createCalendarEventMutation.mockResolvedValue({
      data: {
        createCalendarEvent: {
          success: true,
          calendarEventId: 'calendar-event-id',
        },
      },
    });

    const { result } = renderHook(() => useCreateCalendarEvent());

    await act(async () => {
      await expect(result.current.createCalendarEvent(input)).resolves.toEqual({
        success: true,
        calendarEventId: 'calendar-event-id',
      });
    });

    expect(enqueueSuccessSnackBar).toHaveBeenCalledTimes(1);
    expect(enqueueErrorSnackBar).not.toHaveBeenCalled();
  });

  it('does not show success when the provider succeeded but persistence returned no id', async () => {
    createCalendarEventMutation.mockResolvedValue({
      data: {
        createCalendarEvent: {
          success: true,
          calendarEventId: null,
          error: null,
        },
      },
    });

    const { result } = renderHook(() => useCreateCalendarEvent());

    await act(async () => {
      await expect(result.current.createCalendarEvent(input)).resolves.toEqual({
        success: false,
      });
    });

    expect(enqueueSuccessSnackBar).not.toHaveBeenCalled();
    expect(enqueueErrorSnackBar).toHaveBeenCalledTimes(1);
  });
});
