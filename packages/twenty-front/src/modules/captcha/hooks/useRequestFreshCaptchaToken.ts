import { captchaTokenState } from '@/captcha/states/captchaTokenState';
import { isRequestingCaptchaTokenState } from '@/captcha/states/isRequestingCaptchaTokenState';
import { isCaptchaRequiredForPath } from '@/captcha/utils/isCaptchaRequiredForPath';
import { captchaState } from '@/client-config/states/captchaState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useCallback } from 'react';
import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';
import { CaptchaDriverType } from '~/generated-metadata/graphql';
import { useStore } from 'jotai';

type CaptchaRequestLifecycleOptions = {
  isRequestFailure?: boolean;
};

export const useRequestFreshCaptchaToken = () => {
  const store = useStore();
  const setCaptchaToken = useSetAtomState(captchaTokenState);
  const setIsRequestingCaptchaToken = useSetAtomState(
    isRequestingCaptchaTokenState,
  );

  const requestFreshCaptchaToken = useCallback(
    async (options?: CaptchaRequestLifecycleOptions) => {
      if (!isCaptchaRequiredForPath(window.location.pathname)) {
        return;
      }

      const captcha = store.get(captchaState.atom);

      if (!isDefined(captcha)) {
        return;
      }

      assertIsDefinedOrThrow(captcha);

      if (
        captcha.provider === CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX
      ) {
        setCaptchaToken(undefined);
        setIsRequestingCaptchaToken(false);
        return;
      }

      if (options?.isRequestFailure) {
        return;
      }

      setIsRequestingCaptchaToken(true);

      let captchaWidget: any;
      switch (captcha.provider) {
        case CaptchaDriverType.GOOGLE_RECAPTCHA:
          window.grecaptcha
            .execute(captcha.siteKey, {
              action: 'submit',
            })
            .then((token: string) => {
              setCaptchaToken(token);
              setIsRequestingCaptchaToken(false);
            });
          break;
        case CaptchaDriverType.TURNSTILE:
          captchaWidget = window.turnstile.render('#captcha-widget', {
            sitekey: captcha.siteKey,
          });
          window.turnstile.execute(captchaWidget, {
            callback: (token: string) => {
              setCaptchaToken(token);
              setIsRequestingCaptchaToken(false);
            },
          });
      }
    },
    [setCaptchaToken, setIsRequestingCaptchaToken, store],
  );

  return { requestFreshCaptchaToken };
};
