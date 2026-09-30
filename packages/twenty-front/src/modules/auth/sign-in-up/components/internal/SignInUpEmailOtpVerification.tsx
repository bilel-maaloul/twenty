import { type FormEvent, useState } from 'react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { AppPath } from 'twenty-shared/types';
import { ClickToActionLink } from 'twenty-ui/navigation';
import { MainButton } from 'twenty-ui/input';
import { TextInput } from '@/ui/input/components/TextInput';
import { useAuth } from '@/auth/hooks/useAuth';
import { interactiveEmailOtpChallengeIdState } from '@/auth/states/interactiveEmailOtpChallengeIdState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { ONBOARDING_CONTENT_BLOCK_WIDTH } from '@/onboarding/constants/OnboardingContentBlockWidth';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useNavigateApp } from '~/hooks/useNavigateApp';

const StyledForm = styled.form`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  max-width: 100%;
  width: ${ONBOARDING_CONTENT_BLOCK_WIDTH}px;
`;

const StyledInstructions = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  text-align: center;
`;

const StyledActions = styled.div`
  display: flex;
  justify-content: center;
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const SignInUpEmailOtpVerification = () => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const challengeId = useAtomStateValue(interactiveEmailOtpChallengeIdState);
  const setChallengeId = useSetAtomState(interactiveEmailOtpChallengeIdState);
  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const { verifyInteractiveEmailOtp, resendInteractiveEmailOtp } = useAuth();
  const { enqueueErrorSnackBar } = useSnackBar();
  const navigate = useNavigateApp();
  const { t } = useLingui();

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!challengeId || !/^\d{6}$/.test(code)) {
      enqueueErrorSnackBar({ message: t`Enter the six-digit code.` });
      return;
    }

    setIsSubmitting(true);

    try {
      await verifyInteractiveEmailOtp(challengeId, code);
    } catch {
      setCode('');
      enqueueErrorSnackBar({
        message: t`The code is invalid or expired. Request a new code or sign in again.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!challengeId) {
      return;
    }

    setIsResending(true);

    try {
      await resendInteractiveEmailOtp(challengeId);
      setCode('');
    } catch {
      enqueueErrorSnackBar({
        message: t`Unable to send a new code. Please sign in again.`,
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToSignIn = () => {
    setChallengeId(null);
    setSignInUpStep(SignInUpStep.Email);
    navigate(AppPath.SignInUp);
  };

  return (
    <StyledForm onSubmit={submitCode}>
      <StyledInstructions>
        <Trans>Enter the sign-in code sent to your email address.</Trans>
      </StyledInstructions>
      <TextInput
        autoComplete="one-time-code"
        autoFocus
        inputMode="numeric"
        label={t`Six-digit code`}
        maxLength={6}
        onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        pattern="[0-9]{6}"
        required
        value={code}
        fullWidth
      />
      <MainButton
        disabled={isSubmitting || code.length !== 6}
        fullWidth
        title={t`Verify`}
        type="submit"
        variant="primary"
      />
      <StyledActions>
        <ClickToActionLink
          aria-disabled={isResending}
          href="#"
          onClick={(event) => {
            event.preventDefault();

            if (!isResending) {
              void handleResend();
            }
          }}
        >
          <Trans>Send a new code</Trans>
        </ClickToActionLink>
      </StyledActions>
      <StyledActions>
        <ClickToActionLink
          href="#"
          onClick={(event) => {
            event.preventDefault();
            handleBackToSignIn();
          }}
        >
          <Trans>Back to sign in</Trans>
        </ClickToActionLink>
      </StyledActions>
    </StyledForm>
  );
};
