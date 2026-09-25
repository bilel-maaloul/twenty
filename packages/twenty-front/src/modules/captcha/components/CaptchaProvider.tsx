import React, { useMemo } from 'react';

import { CaptchaProviderScriptLoaderEffect } from '@/captcha/components/CaptchaProviderScriptLoaderEffect';
import { captchaState } from '@/client-config/states/captchaState';
import { isCaptchaRequiredForPath } from '@/captcha/utils/isCaptchaRequiredForPath';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useLocation } from 'react-router-dom';
import { CaptchaDriverType } from '~/generated-metadata/graphql';

export const CaptchaProvider = React.memo(
  ({ children }: React.PropsWithChildren) => {
    const location = useLocation();
    const captcha = useAtomStateValue(captchaState);

    const isCaptchaRequired = useMemo(
      () => isCaptchaRequiredForPath(location.pathname),
      [location.pathname],
    );

    return (
      <>
        {isCaptchaRequired && (
          <>
            {captcha?.provider === CaptchaDriverType.TURNSTILE && (
              <div id="captcha-widget" data-size="invisible"></div>
            )}
            <CaptchaProviderScriptLoaderEffect />
          </>
        )}
        {children}
      </>
    );
  },
);

CaptchaProvider.displayName = 'CaptchaProvider';
