import { useSignInUpForm } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { signInUpModeState } from '@/auth/states/signInUpModeState';
import { isInvitationPasscodeModeState } from '@/auth/states/isInvitationPasscodeModeState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import { isDeveloperDefaultSignInPrefilledState } from '@/client-config/states/isDeveloperDefaultSignInPrefilledState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { renderHook } from '@testing-library/react';
import { act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

const TestWrapper = ({
  children,
  initialEntry = '/',
  isDeveloperDefaultSignInPrefilled = false,
}: {
  children: ReactNode;
  initialEntry?: string;
  isDeveloperDefaultSignInPrefilled?: boolean;
}) => {
  jotaiStore.set(
    isDeveloperDefaultSignInPrefilledState.atom,
    isDeveloperDefaultSignInPrefilled,
  );
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <JotaiProvider store={jotaiStore}>{children}</JotaiProvider>
    </MemoryRouter>
  );
};

describe('useSignInUpForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
  });

  it('should initialize the form with default values', async () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
    });
    expect(result.current.form).toBeDefined();
  });

  it('should not prefill sign-in developer defaults when state is false', () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => (
        <TestWrapper initialEntry="?email=test@test.com">
          {children}
        </TestWrapper>
      ),
    });

    expect(result.current.form.getValues()).toEqual({
      email: 'test@test.com',
      password: '',
    });
  });

  it('should prefill developer defaults when the state is true', () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => (
        <TestWrapper
          initialEntry="?email=test@test.com"
          isDeveloperDefaultSignInPrefilled={true}
        >
          {children}
        </TestWrapper>
      ),
    });

    expect(result.current.form.getValues()).toEqual({
      email: 'test@test.com',
      password: 'tim@apple.dev',
    });
  });

  it('does not apply creation complexity rules to login, but applies them to signup', async () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
    });
    act(() => {
      jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
      result.current.form.setValue('password', 'password123');
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(true);

    act(() => {
      jotaiStore.set(signInUpModeState.atom, SignInUpMode.SignUp);
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(false);

    act(() => {
      result.current.form.setValue('password', 'Password123');
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(true);
  });

  it('applies creation complexity rules to invitation signup', async () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => (
        <TestWrapper initialEntry="/invite/invitation-hash">
          {children}
        </TestWrapper>
      ),
    });
    act(() => {
      jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
      result.current.form.setValue('password', 'password123');
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(false);
  });

  it('requires exactly six numeric characters for invitation passcodes', async () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
    });
    act(() => {
      jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
      jotaiStore.set(isInvitationPasscodeModeState.atom, true);
      result.current.form.setValue('password', '123456');
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(true);

    for (const invalidPasscode of ['12345', '1234567', '12a456']) {
      act(() => result.current.form.setValue('password', invalidPasscode));
      await expect(result.current.form.trigger('password')).resolves.toBe(
        false,
      );
    }
  });

  it('does not apply the permanent-password policy to invitation passcodes', async () => {
    const { result } = renderHook(() => useSignInUpForm(), {
      wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
    });
    act(() => {
      jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
      jotaiStore.set(isInvitationPasscodeModeState.atom, true);
      result.current.form.setValue('password', '123456');
    });

    await expect(result.current.form.trigger('password')).resolves.toBe(true);
  });
});
