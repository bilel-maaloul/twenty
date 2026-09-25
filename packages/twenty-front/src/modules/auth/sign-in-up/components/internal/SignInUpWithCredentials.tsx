import { useHasMultipleAuthMethods } from '@/auth/sign-in-up/hooks/useHasMultipleAuthMethods';
import { useSignInUp } from '@/auth/sign-in-up/hooks/useSignInUp';
import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { lastAuthenticatedMethodState } from '@/auth/states/lastAuthenticatedMethodState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';

import { LastUsedPill } from '@/auth/sign-in-up/components/internal/LastUsedPill';
import { SignInUpEmailField } from '@/auth/sign-in-up/components/internal/SignInUpEmailField';
import { SignInUpPasswordField } from '@/auth/sign-in-up/components/internal/SignInUpPasswordField';
import { useHandleResetPassword } from '@/auth/sign-in-up/hooks/useHandleResetPassword';
import { StyledSsoButtonContainer } from '@/auth/sign-in-up/components/internal/SignInUpSsoButtonStyles';
import { AuthenticatedMethod } from '@/auth/types/AuthenticatedMethod.enum';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import { CaptchaCheckbox } from '@/captcha/components/CaptchaCheckbox';
import { isRequestingCaptchaTokenState } from '@/captcha/states/isRequestingCaptchaTokenState';
import { captchaState } from '@/client-config/states/captchaState';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
import { isDDLLockedState } from '@/client-config/states/isDDLLockedState';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { isDefined } from 'twenty-shared/utils';
import { Loader } from 'twenty-ui/feedback';
import { MainButton, InputHint } from 'twenty-ui/input';
import { ClickToActionLink } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { CaptchaDriverType } from '~/generated-metadata/graphql';

const StyledForm = styled.form`
  align-items: center;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  width: 100%;
`;

const StyledAuthActionContainer = styled.div`
  display: flex;
  justify-content: center;
  padding-top: ${themeCssVariables.spacing[3]};
`;

export const SignInUpWithCredentials = ({
  isGlobalScope,
}: {
  isGlobalScope?: boolean;
}) => {
  const { t } = useLingui();
  const form = useFormContext<Form>();

  const [signInUpStep, setSignInUpStep] = useAtomState(signInUpStepState);
  const [showErrors, setShowErrors] = useState(false);
  const [isPasswordResetMode, setIsPasswordResetMode] = useState(false);
  const [isPasswordResetLoading, setIsPasswordResetLoading] = useState(false);
  const captcha = useAtomStateValue(captchaState);
  const workspacePublicData = useAtomStateValue(workspacePublicDataState);
  const isDDLLocked = useAtomStateValue(isDDLLockedState);
  const isRequestingCaptchaToken = useAtomStateValue(
    isRequestingCaptchaTokenState,
  );
  const lastAuthenticatedMethod = useAtomStateValue(
    lastAuthenticatedMethodState,
  );
  const hasMultipleAuthMethods = useHasMultipleAuthMethods();
  const { isCaptchaReady } = useCaptcha();
  const { handleResetPassword } = useHandleResetPassword();

  const {
    isInviteMode,
    signInUpMode,
    setSignInUpMode,
    continueWithEmail,
    continueWithCredentials,
    submitCredentials,
  } = useSignInUp(form);
  const email = form.watch('email') ?? '';
  const isV2Checkbox =
    captcha?.provider === CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX;

  const isLastUsed =
    signInUpStep === SignInUpStep.Init &&
    lastAuthenticatedMethod === AuthenticatedMethod.EMAIL &&
    (isGlobalScope || hasMultipleAuthMethods);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitButtonDisabled) return;

    if (signInUpStep === SignInUpStep.Init) {
      continueWithEmail();
    } else if (signInUpStep === SignInUpStep.Email) {
      if (isDefined(form?.formState?.errors?.email)) {
        setShowErrors(true);
        return;
      }
      continueWithCredentials();
    } else if (signInUpStep === SignInUpStep.Password) {
      if (isPasswordResetMode) {
        if (isPasswordResetLoading) {
          return;
        }

        setIsPasswordResetLoading(true);
        try {
          await handleResetPassword(email)();
        } finally {
          setIsPasswordResetLoading(false);
        }
      } else if (!form.formState.isSubmitting) {
        setShowErrors(true);
        form.handleSubmit(submitCredentials)();
      }
    }
  };

  const onEmailChange = (email: string) => {
    if (email !== form.getValues('email')) {
      setIsPasswordResetMode(false);
      setSignInUpStep(SignInUpStep.Email);
    }
  };

  const buttonTitle = useMemo(() => {
    if (signInUpStep === SignInUpStep.Init) {
      return t`Continue with Email`;
    }

    if (isInviteMode) {
      return t`Continue`;
    }

    if (isPasswordResetMode) {
      return t`Send reset link`;
    }

    if (
      signInUpMode === SignInUpMode.SignIn &&
      signInUpStep === SignInUpStep.Password
    ) {
      return t`Sign in`;
    }

    if (
      signInUpMode === SignInUpMode.SignUp &&
      signInUpStep === SignInUpStep.Password
    ) {
      return t`Sign up`;
    }

    return t`Continue`;
  }, [isInviteMode, isPasswordResetMode, signInUpMode, signInUpStep, t]);

  const shouldWaitForCaptchaToken =
    signInUpStep !== SignInUpStep.Init &&
    isDefined(captcha?.provider) &&
    isRequestingCaptchaToken;

  const isEmailStepSubmitButtonDisabledCondition =
    signInUpStep === SignInUpStep.Email &&
    isDefined(form.formState.errors['email']);

  // TODO: isValid is actually a proxy function. If it is not rendered the first time, react might not trigger re-renders
  // We make the isValid check synchronous and update a reactState to make sure this does not happen
  const isPasswordStepSubmitButtonDisabledCondition =
    signInUpStep === SignInUpStep.Password &&
    ((!isPasswordResetMode && !form.formState.isValid) ||
      (isPasswordResetMode && !email) ||
      (isV2Checkbox && !isCaptchaReady) ||
      form.formState.isSubmitting ||
      isPasswordResetLoading ||
      shouldWaitForCaptchaToken);

  const isSignUpBlockedByDDLLock =
    isDDLLocked &&
    signInUpMode === SignInUpMode.SignUp &&
    signInUpStep === SignInUpStep.Password;

  const isSubmitButtonDisabled =
    isEmailStepSubmitButtonDisabledCondition ||
    isPasswordStepSubmitButtonDisabledCondition ||
    isSignUpBlockedByDDLLock;

  return (
    <>
      {(signInUpStep === SignInUpStep.Password ||
        signInUpStep === SignInUpStep.Email ||
        signInUpStep === SignInUpStep.Init) && (
        <StyledForm onSubmit={handleSubmit}>
          {signInUpStep !== SignInUpStep.Init && (
            <SignInUpEmailField
              showErrors={showErrors}
              onInputChange={onEmailChange}
            />
          )}
          {signInUpStep === SignInUpStep.Password && (
            <>
              {!isPasswordResetMode && (
                <SignInUpPasswordField
                  showErrors={showErrors}
                  signInUpMode={signInUpMode}
                />
              )}
              <CaptchaCheckbox
                challengeKey={`${isGlobalScope ? 'global' : (workspacePublicData?.id ?? window.location.origin)}:${isPasswordResetMode ? 'password-reset' : isInviteMode ? 'invitation' : signInUpMode}:${email}`}
              />
            </>
          )}
          <StyledSsoButtonContainer>
            <MainButton
              title={buttonTitle}
              type="submit"
              variant={
                signInUpStep === SignInUpStep.Init ? 'secondary' : 'primary'
              }
              Icon={() => (form.formState.isSubmitting ? <Loader /> : null)}
              disabled={isSubmitButtonDisabled}
              fullWidth
            />
            {isLastUsed && <LastUsedPill />}
            {isSignUpBlockedByDDLLock && (
              <InputHint>{t`Sign-up is temporarily unavailable during maintenance.`}</InputHint>
            )}
            {signInUpStep === SignInUpStep.Password && !isInviteMode && (
              <StyledAuthActionContainer>
                {isPasswordResetMode ? (
                  <ClickToActionLink
                    onClick={() => setIsPasswordResetMode(false)}
                  >
                    {t`Back to sign in`}
                  </ClickToActionLink>
                ) : signInUpMode === SignInUpMode.SignIn ? (
                  <ClickToActionLink
                    onClick={() => {
                      if (isV2Checkbox) {
                        setIsPasswordResetMode(true);
                      } else {
                        void handleResetPassword(email)();
                      }
                    }}
                  >
                    {t`Forgot your password?`}
                  </ClickToActionLink>
                ) : (
                  <ClickToActionLink
                    onClick={() => {
                      form.setValue('password', '');
                      setSignInUpMode(SignInUpMode.SignIn);
                    }}
                  >
                    {t`Already have an account? Sign in`}
                  </ClickToActionLink>
                )}
              </StyledAuthActionContainer>
            )}
            {signInUpStep === SignInUpStep.Password &&
              !isInviteMode &&
              !isPasswordResetMode &&
              signInUpMode === SignInUpMode.SignIn && (
                <StyledAuthActionContainer>
                  <ClickToActionLink
                    onClick={() => {
                      form.setValue('password', '');
                      setSignInUpMode(SignInUpMode.SignUp);
                    }}
                  >
                    {t`Create account`}
                  </ClickToActionLink>
                </StyledAuthActionContainer>
              )}
          </StyledSsoButtonContainer>
        </StyledForm>
      )}
    </>
  );
};
