import { ApolloProvider as ApolloProviderBase } from '@apollo/client/react';
import { useRef } from 'react';

import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { createCaptchaRefreshLink } from '@/apollo/utils/captchaRefreshLink';
import { useRequestFreshCaptchaToken } from '@/captcha/hooks/useRequestFreshCaptchaToken';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const ApolloProvider = ({ children }: React.PropsWithChildren) => {
  const { requestFreshCaptchaToken } = useRequestFreshCaptchaToken();
  const { isV2Checkbox } = useCaptcha();
  const isV2CheckboxRef = useRef(isV2Checkbox);
  isV2CheckboxRef.current = isV2Checkbox;

  const captchaRefreshLink = createCaptchaRefreshLink(
    requestFreshCaptchaToken,
    () => isV2CheckboxRef.current,
  );

  const apolloClient = useApolloFactory({
    uri: `${REACT_APP_SERVER_BASE_URL}/metadata`,
    devtools: { enabled: process.env.IS_DEBUG_MODE === 'true' },
    extraLinks: [captchaRefreshLink],
  });

  if (process.env.NODE_ENV === 'development') {
    window.__APOLLO_CLIENT__ = apolloClient;
  }

  return (
    <ApolloProviderBase client={apolloClient}>{children}</ApolloProviderBase>
  );
};
