import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Provider as JotaiProvider } from 'jotai';

import { SignInUpWithCredentials } from '@/auth/sign-in-up/components/internal/SignInUpWithCredentials';
import { useSignInUp } from '@/auth/sign-in-up/hooks/useSignInUp';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { captchaTokenState } from '@/captcha/states/captchaTokenState';
import { isCaptchaScriptLoadedState } from '@/captcha/states/isCaptchaScriptLoadedState';
import {
  type CaptchaWindow,
  type GoogleRecaptchaV2RenderParameters,
} from '@/captcha/types/google-recaptcha-api.type';
import { captchaState } from '@/client-config/states/captchaState';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { CaptchaDriverType, type Captcha } from '~/generated-metadata/graphql';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

jest.mock('@/auth/sign-in-up/hooks/useSignInUp', () => ({
  useSignInUp: jest.fn(),
}));

jest.mock('@/auth/sign-in-up/hooks/useHasMultipleAuthMethods', () => ({
  useHasMultipleAuthMethods: () => false,
}));

jest.mock('@/auth/sign-in-up/hooks/useHandleResetPassword', () => ({
  useHandleResetPassword: () => ({
    handleResetPassword: jest.fn(() => jest.fn()),
  }),
}));

jest.mock('@/auth/sign-in-up/components/internal/SignInUpEmailField', () => ({
  SignInUpEmailField: () => <div>Email entry</div>,
}));

jest.mock(
  '@/auth/sign-in-up/components/internal/SignInUpPasswordField',
  () => ({
    SignInUpPasswordField: () => <div>Password entry</div>,
  }),
);

jest.mock('react-hook-form', () => ({
  ...jest.requireActual('react-hook-form'),
  useFormContext: () => ({
    watch: () => 'person@example.com',
    getValues: () => 'person@example.com',
    setValue: jest.fn(),
    formState: {
      errors: {},
      isSubmitting: false,
      isValid: true,
    },
    handleSubmit: jest.fn(() => jest.fn()),
  }),
}));

describe('SignInUpWithCredentials CAPTCHA placement', () => {
  const renderMock = jest.fn();
  let widgetParameters: GoogleRecaptchaV2RenderParameters | undefined;
  const signInUpHandlers = {
    isInviteMode: false,
    signInUpMode: SignInUpMode.SignIn,
    continueWithEmail: jest.fn(),
    continueWithCredentials: jest.fn(),
    submitCredentials: jest.fn(),
  };

  beforeEach(() => {
    resetJotaiStore();
    jest.clearAllMocks();
    (useSignInUp as jest.Mock).mockReturnValue(signInUpHandlers);
    jotaiStore.set(captchaState.atom, {
      provider: CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX,
      siteKey: 'public-site-key',
    } as Captcha);
    jotaiStore.set(isCaptchaScriptLoadedState.atom, true);
    jotaiStore.set(clientConfigApiStatusState.atom, {
      isLoadedOnce: true,
      isLoading: false,
      isErrored: false,
      isSaved: false,
    });
    (window as CaptchaWindow).grecaptcha = {
      ready: (callback: () => void) => callback(),
      render: (
        container: HTMLElement,
        parameters: GoogleRecaptchaV2RenderParameters,
      ) => {
        renderMock(container, parameters);
        widgetParameters = parameters;
        return 7;
      },
      reset: jest.fn(),
    };
  });

  const renderForm = () =>
    render(
      <JotaiProvider store={jotaiStore}>
        <I18nProvider i18n={i18n}>
          <SignInUpWithCredentials />
        </I18nProvider>
      </JotaiProvider>,
    );

  it('does not render CAPTCHA or query account existence on the email step', () => {
    jotaiStore.set(signInUpStepState.atom, SignInUpStep.Email);
    renderForm();

    expect(screen.queryByRole('group', { name: "I'm not a robot" })).toBeNull();
    expect(renderMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(signInUpHandlers.continueWithCredentials).toHaveBeenCalledTimes(1);
  });

  it('renders one checkbox on the password step and enables sign-in only after a response', async () => {
    jotaiStore.set(signInUpStepState.atom, SignInUpStep.Password);
    renderForm();

    const signInButton = screen.getByRole('button', { name: 'Sign in' });
    expect(signInButton).toBeDisabled();
    expect(
      screen.getByRole('group', { name: "I'm not a robot" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => widgetParameters?.callback('fresh-response'));

    expect(jotaiStore.get(captchaTokenState.atom)).toBe('fresh-response');
    expect(signInButton).toBeEnabled();
  });
});
