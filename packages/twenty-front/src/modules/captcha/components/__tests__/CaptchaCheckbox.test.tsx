import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { captchaTokenState } from '@/captcha/states/captchaTokenState';
import { isCaptchaScriptLoadedState } from '@/captcha/states/isCaptchaScriptLoadedState';
import { CaptchaCheckbox } from '@/captcha/components/CaptchaCheckbox';
import {
  type CaptchaWindow,
  type GoogleRecaptchaV2RenderParameters,
} from '@/captcha/types/google-recaptcha-api.type';
import { captchaState } from '@/client-config/states/captchaState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { CaptchaDriverType, type Captcha } from '~/generated-metadata/graphql';

describe('CaptchaCheckbox', () => {
  const resetMock = jest.fn();
  const renderMock = jest.fn();
  let renderedParameters: GoogleRecaptchaV2RenderParameters | undefined;

  beforeEach(() => {
    resetJotaiStore();
    jest.clearAllMocks();
    renderedParameters = undefined;
    jotaiStore.set(captchaState.atom, {
      provider: CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX,
      siteKey: 'public-site-key',
    } as Captcha);
    jotaiStore.set(isCaptchaScriptLoadedState.atom, true);

    renderMock.mockImplementation((_container, parameters) => {
      renderedParameters = parameters;
      return 12;
    });
    (window as CaptchaWindow).grecaptcha = {
      ready: (callback: () => void) => callback(),
      render: renderMock,
      reset: resetMock,
    };
  });

  const renderCaptchaCheckbox = (
    colorScheme: 'light' | 'dark' = 'light',
    challengeKey = 'sign-in:test@example.com',
  ) =>
    render(
      <ThemeProvider colorScheme={colorScheme} applyToRoot={false}>
        <JotaiProvider store={jotaiStore}>
          <I18nProvider i18n={i18n}>
            <CaptchaCheckbox challengeKey={challengeKey} />
          </I18nProvider>
        </JotaiProvider>
      </ThemeProvider>,
    );

  const getRenderedParameters = () => {
    if (!renderedParameters) {
      throw new Error('reCAPTCHA widget parameters have not been rendered');
    }

    return renderedParameters;
  };

  it('renders one visible explicit v2 widget using the public site key', async () => {
    const { rerender } = renderCaptchaCheckbox();

    expect(
      screen.getByRole('group', { name: "I'm not a robot" }),
    ).toBeInTheDocument();

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    expect(renderMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        sitekey: 'public-site-key',
        size: 'normal',
        theme: 'light',
      }),
    );

    rerender(
      <ThemeProvider colorScheme="light" applyToRoot={false}>
        <JotaiProvider store={jotaiStore}>
          <I18nProvider i18n={i18n}>
            <CaptchaCheckbox challengeKey="sign-in:test@example.com" />
          </I18nProvider>
        </JotaiProvider>
      </ThemeProvider>,
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('renders the Google widget with the dark theme', async () => {
    renderCaptchaCheckbox('dark');

    await waitFor(() => expect(renderedParameters).toBeDefined());
    expect(getRenderedParameters().theme).toBe('dark');
  });

  it('recreates one widget and invalidates its token when the theme changes', async () => {
    const { rerender } = renderCaptchaCheckbox('dark');

    await waitFor(() => expect(renderedParameters).toBeDefined());
    act(() => getRenderedParameters().callback('dark-response'));
    expect(jotaiStore.get(captchaTokenState.atom)).toBe('dark-response');

    rerender(
      <ThemeProvider colorScheme="light" applyToRoot={false}>
        <JotaiProvider store={jotaiStore}>
          <I18nProvider i18n={i18n}>
            <CaptchaCheckbox challengeKey="sign-in:test@example.com" />
          </I18nProvider>
        </JotaiProvider>
      </ThemeProvider>,
    );

    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
    expect(resetMock).toHaveBeenCalledWith(12);
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
    expect(getRenderedParameters().theme).toBe('light');
    expect(screen.getByRole('group').children).toHaveLength(1);
  });

  it('stores a success response and clears it on expiry or widget error', async () => {
    renderCaptchaCheckbox();

    await waitFor(() => expect(renderedParameters).toBeDefined());
    const parameters = getRenderedParameters();

    act(() => parameters.callback('one-use-response'));
    expect(jotaiStore.get(captchaTokenState.atom)).toBe('one-use-response');

    act(() => parameters['expired-callback']());
    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
    expect(resetMock).toHaveBeenCalledWith(12);

    act(() => parameters.callback('second-response'));
    act(() => parameters['error-callback']());
    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
  });

  it('resets the widget when the token is explicitly cleared', async () => {
    renderCaptchaCheckbox('light', 'forgot-password:test@example.com');

    await waitFor(() => expect(renderedParameters).toBeDefined());
    act(() => getRenderedParameters().callback('one-use-response'));
    act(() => jotaiStore.set(captchaTokenState.atom, undefined));

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith(12));
    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
  });

  it('clears the response and resets the widget when the challenge context changes', async () => {
    const { rerender } = renderCaptchaCheckbox(
      'light',
      'workspace-a:sign-in:user@example.com',
    );

    await waitFor(() => expect(renderedParameters).toBeDefined());
    act(() => getRenderedParameters().callback('one-use-response'));
    expect(jotaiStore.get(captchaTokenState.atom)).toBe('one-use-response');

    rerender(
      <ThemeProvider colorScheme="light" applyToRoot={false}>
        <JotaiProvider store={jotaiStore}>
          <I18nProvider i18n={i18n}>
            <CaptchaCheckbox challengeKey="workspace-b:sign-in:user@example.com" />
          </I18nProvider>
        </JotaiProvider>
      </ThemeProvider>,
    );

    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
    expect(resetMock).toHaveBeenCalledWith(12);
    act(() => getRenderedParameters().callback('new-context-response'));
    resetMock.mockClear();
    act(() => jotaiStore.set(captchaTokenState.atom, undefined));
    expect(resetMock).toHaveBeenCalledWith(12);
  });

  it.each([CaptchaDriverType.GOOGLE_RECAPTCHA, CaptchaDriverType.TURNSTILE])(
    'does not clear or render the existing %s challenge',
    (provider) => {
      jotaiStore.set(captchaState.atom, {
        provider,
        siteKey: 'public-site-key',
      } as Captcha);
      jotaiStore.set(captchaTokenState.atom, 'existing-response');
      const { unmount } = render(
        <JotaiProvider store={jotaiStore}>
          <ThemeProvider colorScheme="light" applyToRoot={false}>
            <CaptchaCheckbox challengeKey="login" />
          </ThemeProvider>
        </JotaiProvider>,
      );
      unmount();
      expect(jotaiStore.get(captchaTokenState.atom)).toBe('existing-response');
      expect(renderMock).not.toHaveBeenCalled();
      expect(resetMock).not.toHaveBeenCalled();
    },
  );

  it('disposes replayed widgets and ignores callbacks after unmount', () => {
    const { unmount } = render(
      <StrictMode>
        <ThemeProvider colorScheme="light" applyToRoot={false}>
          <JotaiProvider store={jotaiStore}>
            <I18nProvider i18n={i18n}>
              <CaptchaCheckbox challengeKey="login" />
            </I18nProvider>
          </JotaiProvider>
        </ThemeProvider>
      </StrictMode>,
    );
    expect(screen.getByRole('group').children).toHaveLength(1);
    const parameters = getRenderedParameters();
    const discardedParameters = renderMock.mock
      .calls[0][1] as GoogleRecaptchaV2RenderParameters;
    act(() => discardedParameters.callback('discarded-response'));
    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
    unmount();
    act(() => parameters.callback('late-response'));
    expect(jotaiStore.get(captchaTokenState.atom)).toBeUndefined();
  });
});
