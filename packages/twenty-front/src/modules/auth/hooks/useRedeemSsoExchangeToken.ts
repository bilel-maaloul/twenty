import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { interactiveEmailOtpChallengeIdState } from '@/auth/states/interactiveEmailOtpChallengeIdState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useMarkSessionActive } from '@/auth/hooks/useMarkSessionActive';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation } from '@apollo/client/react';
import { useCallback } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { GetAuthTokensFromSsoExchangeTokenDocument } from '~/generated-metadata/graphql';

export const useRedeemSsoExchangeToken = () => {
  const { enqueueErrorSnackBar } = useSnackBar();
  const markSessionActive = useMarkSessionActive();
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );
  const setEmailOtpChallengeId = useSetAtomState(
    interactiveEmailOtpChallengeIdState,
  );
  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const [getAuthTokensFromSsoExchangeToken] = useMutation(
    GetAuthTokensFromSsoExchangeTokenDocument,
  );

  const redeemSsoExchangeToken = useCallback(
    async (ssoExchangeToken: string) => {
      // Keeps PageChangeEffect from consuming returnToPath while the server
      // swaps the session cookie
      setIsAppEffectRedirectEnabled(false);

      try {
        const { data } = await getAuthTokensFromSsoExchangeToken({
          variables: { ssoExchangeToken },
        });

        if (!isDefined(data?.getAuthTokensFromSSOExchangeToken)) {
          throw new Error('No getAuthTokensFromSSOExchangeToken result');
        }

        const authenticationResult = data.getAuthTokensFromSSOExchangeToken;

        if (authenticationResult.requiresEmailOtp) {
          if (!authenticationResult.emailOtpChallengeId) {
            throw new Error('No email OTP challenge');
          }

          setEmailOtpChallengeId(authenticationResult.emailOtpChallengeId);
          setSignInUpStep(SignInUpStep.EmailOtpVerification);
          return;
        }

        if (!authenticationResult.tokens) {
          throw new Error('No authentication token pair');
        }

        markSessionActive();
      } catch (error: unknown) {
        enqueueErrorSnackBar(
          CombinedGraphQLErrors.is(error)
            ? { apolloError: error }
            : { message: error instanceof Error ? error.message : undefined },
        );
      } finally {
        setIsAppEffectRedirectEnabled(true);
      }
    },
    [
      getAuthTokensFromSsoExchangeToken,
      markSessionActive,
      setIsAppEffectRedirectEnabled,
      setEmailOtpChallengeId,
      setSignInUpStep,
      enqueueErrorSnackBar,
    ],
  );

  return { redeemSsoExchangeToken };
};
