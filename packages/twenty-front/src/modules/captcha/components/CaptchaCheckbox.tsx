import { captchaTokenState } from '@/captcha/states/captchaTokenState';
import { isCaptchaScriptLoadedState } from '@/captcha/states/isCaptchaScriptLoadedState';
import { captchaState } from '@/client-config/states/captchaState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { CaptchaDriverType } from '~/generated-metadata/graphql';
import { useThemeColorScheme } from 'twenty-ui/theme-constants';
import { type CaptchaWindow } from '@/captcha/types/google-recaptcha-api.type';

const StyledCaptchaContainer = styled.div`
  background: transparent;
  border: none;
  box-shadow: none;
`;

export const CaptchaCheckbox = ({ challengeKey }: { challengeKey: string }) => {
  const captcha = useAtomStateValue(captchaState);
  const theme = useThemeColorScheme();

  if (
    captcha?.provider !== CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX ||
    !captcha.siteKey
  ) {
    return null;
  }

  return (
    <GoogleCaptchaCheckbox
      key={`${captcha.siteKey}:${challengeKey}:${theme}`}
      theme={theme}
      siteKey={captcha.siteKey}
    />
  );
};

const GoogleCaptchaCheckbox = ({
  siteKey,
  theme,
}: {
  siteKey: string;
  theme: 'dark' | 'light';
}) => {
  const { t } = useLingui();
  const captchaToken = useAtomStateValue(captchaTokenState);
  const isCaptchaScriptLoaded = useAtomStateValue(isCaptchaScriptLoadedState);
  const setCaptchaToken = useSetAtomState(captchaTokenState);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | undefined>(undefined);
  const previousCaptchaTokenRef = useRef<string | undefined>(undefined);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current === undefined) {
      return;
    }

    (window as CaptchaWindow).grecaptcha?.reset(widgetIdRef.current);
  }, []);

  useLayoutEffect(() => {
    setCaptchaToken(undefined);

    return () => {
      setCaptchaToken(undefined);
    };
  }, [setCaptchaToken]);

  useEffect(() => {
    if (!siteKey || !isCaptchaScriptLoaded || !containerRef.current) {
      return;
    }

    let isMounted = true;
    const grecaptcha = (window as CaptchaWindow).grecaptcha;
    // Google has no remove API; each effect lifetime owns its render target.
    const renderTarget = document.createElement('div');
    containerRef.current.appendChild(renderTarget);

    grecaptcha?.ready(() => {
      if (
        !isMounted ||
        !containerRef.current ||
        widgetIdRef.current !== undefined
      ) {
        return;
      }

      widgetIdRef.current = grecaptcha.render(renderTarget, {
        sitekey: siteKey,
        size: 'normal',
        theme,
        callback: (response: string) => {
          if (isMounted) setCaptchaToken(response);
        },
        'expired-callback': () => {
          if (!isMounted) return;
          setCaptchaToken(undefined);
          resetWidget();
        },
        'error-callback': () => {
          if (!isMounted) return;
          setCaptchaToken(undefined);
          resetWidget();
        },
      });
    });

    return () => {
      isMounted = false;
      resetWidget();
      widgetIdRef.current = undefined;
      renderTarget.remove();
    };
  }, [siteKey, theme, isCaptchaScriptLoaded, resetWidget, setCaptchaToken]);

  useEffect(() => {
    if (previousCaptchaTokenRef.current && !captchaToken) {
      resetWidget();
    }

    previousCaptchaTokenRef.current = captchaToken;
  }, [captchaToken, resetWidget]);

  return (
    <StyledCaptchaContainer
      aria-label={t`I'm not a robot`}
      ref={containerRef}
      role="group"
    />
  );
};
