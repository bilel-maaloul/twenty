import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { useSignInUp } from '@/auth/sign-in-up/hooks/useSignInUp';
import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { isInvitationPasscodeModeState } from '@/auth/states/isInvitationPasscodeModeState';
import { signInUpModeState } from '@/auth/states/signInUpModeState';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

const mockVerifyFirstPasswordInvitationPasscode = jest.fn();
const mockSignInWithCredentials = jest.fn();
const mockSignInWithCredentialsInWorkspace = jest.fn();
const mockSignUpWithCredentials = jest.fn();
const mockSignUpWithCredentialsInWorkspace = jest.fn();
const mockReadCaptchaToken = jest.fn(() => 'captcha-token');
const mockEnqueueErrorSnackBar = jest.fn();

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    verifyFirstPasswordInvitationPasscode:
      mockVerifyFirstPasswordInvitationPasscode,
    signInWithCredentials: mockSignInWithCredentials,
    signInWithCredentialsInWorkspace: mockSignInWithCredentialsInWorkspace,
    signUpWithCredentials: mockSignUpWithCredentials,
    signUpWithCredentialsInWorkspace: mockSignUpWithCredentialsInWorkspace,
  }),
}));

jest.mock('@/captcha/hooks/useReadCaptchaToken', () => ({
  useReadCaptchaToken: () => ({ readCaptchaToken: mockReadCaptchaToken }),
}));

jest.mock('@/client-config/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ isCaptchaReady: true }),
}));

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({ isOnAWorkspace: false }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: mockEnqueueErrorSnackBar }),
}));

jest.mock(
  '@/domain-manager/hooks/useBuildSearchParamsFromUrlSyncedStates',
  () => ({
    useBuildSearchParamsFromUrlSyncedStates: () => ({
      buildSearchParamsFromUrlSyncedStates: jest.fn(),
    }),
  }),
);

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider i18n={i18n}>
    <MemoryRouter>
      <JotaiProvider store={jotaiStore}>{children}</JotaiProvider>
    </MemoryRouter>
  </I18nProvider>
);

describe('useSignInUp invitation passcodes', () => {
  beforeEach(() => {
    resetJotaiStore();
    jest.clearAllMocks();
    mockVerifyFirstPasswordInvitationPasscode.mockResolvedValue(undefined);
    jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
    jotaiStore.set(isInvitationPasscodeModeState.atom, true);
    jotaiStore.set(signInUpModeState.atom, SignInUpMode.SignIn);
  });

  it('verifies the passcode without reading CAPTCHA or calling password sign-in', async () => {
    const { result } = renderHook(
      () => {
        const form = useForm<Form>({
          defaultValues: { email: '', password: '' },
        });

        return { form, auth: useSignInUp(form) };
      },
      {
        wrapper: Wrapper,
      },
    );

    await act(async () => {
      result.current.form.setValue('email', ' Member@Example.com ');
      result.current.form.setValue('password', '123456');
      await result.current.auth.submitCredentials(
        result.current.form.getValues(),
      );
    });

    expect(mockVerifyFirstPasswordInvitationPasscode).toHaveBeenCalledWith(
      'member@example.com',
      '123456',
    );
    expect(mockReadCaptchaToken).not.toHaveBeenCalled();
    expect(mockSignInWithCredentials).not.toHaveBeenCalled();
    expect(mockSignInWithCredentialsInWorkspace).not.toHaveBeenCalled();
    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
    expect(jotaiStore.get(isInvitationPasscodeModeState.atom)).toBe(false);
  });
});
