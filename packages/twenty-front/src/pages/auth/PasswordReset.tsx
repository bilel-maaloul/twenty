import { SKELETON_LOADER_HEIGHT_SIZES } from '@/activities/components/SkeletonLoader';
import { Logo } from '@/auth/components/Logo';
import { Title } from '@/auth/components/Title';
import { useAuth } from '@/auth/hooks/useAuth';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { currentUserState } from '@/auth/states/currentUserState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { PASSWORD_REGEX } from '@/auth/utils/passwordRegex';
import { CaptchaCheckbox } from '@/captcha/components/CaptchaCheckbox';
import { useReadCaptchaToken } from '@/captcha/hooks/useReadCaptchaToken';
import { captchaState } from '@/client-config/states/captchaState';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { TextInput } from '@/ui/input/components/TextInput';
import { ModalContent } from 'twenty-ui/surfaces';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { styled } from '@linaria/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { i18n } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { motion } from 'framer-motion';
import { useContext, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import { useParams } from 'react-router-dom';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { AppPath } from 'twenty-shared/types';
import { MainButton } from 'twenty-ui/input';
import { CaptchaDriverType } from '~/generated-metadata/graphql';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { z } from 'zod';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  UpdatePasswordViaResetTokenDocument,
  ValidatePasswordResetTokenDocument,
} from '~/generated-metadata/graphql';
import { useNavigateApp } from '~/hooks/useNavigateApp';

const passwordLengthMessage = msg`Password must be between 8 and 50 characters`;

const validationSchema = z
  .object({
    passwordResetToken: z.string(),
    newPassword: z
      .string()
      .regex(PASSWORD_REGEX, i18n._(passwordLengthMessage)),
  })
  .required();

type Form = z.infer<typeof validationSchema>;

const StyledMainContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  width: 100%;
`;

const StyledForm = styled.form`
  align-items: center;
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const StyledFullWidthContainer = styled.div`
  width: 100%;
`;

const StyledInputContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[3]};
`;

const StyledMainButtonContainer = styled.div`
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const PasswordReset = () => {
  const { theme } = useContext(ThemeContext);
  const { t } = useLingui();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();

  const workspacePublicData = useAtomStateValue(workspacePublicDataState);
  const setCurrentUser = useSetAtomState(currentUserState);

  const navigate = useNavigateApp();
  const { redirect } = useRedirect();

  const [email, setEmail] = useState('');
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isTargetUserPasswordSet, setIsTargetUserPasswordSet] = useState(false);
  const [isPasswordUpdated, setIsPasswordUpdated] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const passwordResetToken = useParams().passwordResetToken;

  const isLogged = useIsLogged();

  const { control, getValues, handleSubmit } = useForm<Form>({
    mode: 'onChange',
    defaultValues: {
      passwordResetToken: passwordResetToken ?? '',
      newPassword: '',
    },
    resolver: zodResolver(validationSchema),
  });

  const { data: tokenValidationData, error: tokenValidationError } = useQuery(
    ValidatePasswordResetTokenDocument,
    {
      variables: {
        token: passwordResetToken ?? '',
      },
      skip: !passwordResetToken || isTokenValid,
    },
  );

  useEffect(() => {
    if (tokenValidationError) {
      enqueueErrorSnackBar({
        apolloError: tokenValidationError,
      });
      navigate(AppPath.Index);
    }
  }, [tokenValidationError, enqueueErrorSnackBar, navigate]);

  useEffect(() => {
    if (tokenValidationData) {
      setIsTokenValid(true);
      const validationResult = tokenValidationData?.validatePasswordResetToken;
      if (isNonEmptyString(validationResult?.email)) {
        setEmail(validationResult.email);
      }
      if (validationResult?.hasPassword) {
        setIsTargetUserPasswordSet(validationResult.hasPassword);
      }
    }
  }, [tokenValidationData]);

  const [updatePasswordViaToken, { loading: isUpdatingPassword }] = useMutation(
    UpdatePasswordViaResetTokenDocument,
  );

  const { signInWithCredentialsInWorkspace, signInWithCredentials } = useAuth();
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();
  const { readCaptchaToken } = useReadCaptchaToken();
  const { isCaptchaReady } = useCaptcha();
  const captcha = useAtomStateValue(captchaState);
  const isGoogleRecaptchaV2Checkbox =
    captcha?.provider === CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX;

  const onSubmit = async (formData: Form) => {
    try {
      const { data } = await updatePasswordViaToken({
        variables: {
          token: formData.passwordResetToken,
          newPassword: formData.newPassword,
        },
      });

      if (!data?.updatePasswordViaResetToken.success) {
        enqueueErrorSnackBar({
          message: t`There was an error while updating password.`,
        });
        return;
      }

      const successMessage =
        isTargetUserPasswordSet === false
          ? t`Password has been set`
          : t`Password has been updated`;

      setCurrentUser((currentUser) =>
        currentUser ? { ...currentUser, hasPassword: true } : currentUser,
      );

      if (isLogged) {
        enqueueSuccessSnackBar({
          message: successMessage,
        });
        navigate(AppPath.Index);
        return;
      }

      if (isGoogleRecaptchaV2Checkbox) {
        setIsPasswordUpdated(true);
        enqueueSuccessSnackBar({
          message: t`Password updated. Sign in with your new password.`,
        });
        return;
      }

      if (!isCaptchaReady) {
        enqueueErrorSnackBar({
          message: t`Captcha (anti-bot check) is still loading, try again`,
        });
        return;
      }

      const token = readCaptchaToken();

      const outcome = isOnAWorkspace
        ? await signInWithCredentialsInWorkspace(
            email || '',
            formData.newPassword,
            token,
          )
        : await signInWithCredentials(email || '', formData.newPassword, token);

      if (outcome === 'first-password-required') {
        return;
      }

      redirect(AppPath.Index);
    } catch (err) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(err) ? err : undefined,
      });
    }
  };

  const signInAfterPasswordUpdate = async () => {
    if (!isCaptchaReady) {
      enqueueErrorSnackBar({
        message: t`Captcha (anti-bot check) is still loading, try again`,
      });
      return;
    }

    setIsSigningIn(true);
    try {
      const password = getValues('newPassword');
      const captchaToken = readCaptchaToken();
      const outcome = isOnAWorkspace
        ? await signInWithCredentialsInWorkspace(email, password, captchaToken)
        : await signInWithCredentials(email, password, captchaToken);

      if (outcome !== 'first-password-required') {
        redirect(AppPath.Index);
      }
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const passwordActionLabel =
    isTargetUserPasswordSet === true ? t`Change Password` : t`Set Password`;

  return (
    isTokenValid && (
      <ModalContent isVerticallyCentered isHorizontallyCentered>
        <StyledMainContainer>
          <AnimatedEaseIn>
            <Logo
              secondaryLogo={workspacePublicData?.logo}
              placeholder={workspacePublicData?.displayName}
            />
          </AnimatedEaseIn>
          <Title animate>{passwordActionLabel}</Title>
          <StyledOnboardingContentContainer>
            {!email ? (
              <SkeletonTheme
                baseColor={theme.background.quaternary}
                highlightColor={theme.background.secondary}
              >
                <Skeleton
                  height={SKELETON_LOADER_HEIGHT_SIZES.standard.m}
                  count={2}
                  style={{
                    marginBottom: themeCssVariables.spacing[2],
                  }}
                />
              </SkeletonTheme>
            ) : (
              <StyledForm onSubmit={handleSubmit(onSubmit)}>
                <StyledFullWidthContainer>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{
                      type: 'spring',
                      stiffness: 800,
                      damping: 35,
                    }}
                  >
                    <StyledInputContainer>
                      <TextInput
                        autoFocus
                        value={email}
                        placeholder={t`Email`}
                        fullWidth
                        disabled
                      />
                    </StyledInputContainer>
                  </motion.div>
                </StyledFullWidthContainer>
                {!isPasswordUpdated && (
                  <StyledFullWidthContainer>
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{
                        type: 'spring',
                        stiffness: 800,
                        damping: 35,
                      }}
                    >
                      <Controller
                        name="newPassword"
                        control={control}
                        render={({
                          field: { onChange, onBlur, value },
                          fieldState: { error },
                        }) => (
                          <StyledInputContainer>
                            <TextInput
                              autoFocus
                              value={value}
                              type="password"
                              placeholder={t`New Password`}
                              onBlur={onBlur}
                              onChange={onChange}
                              error={error?.message}
                              fullWidth
                            />
                          </StyledInputContainer>
                        )}
                      />
                    </motion.div>
                  </StyledFullWidthContainer>
                )}

                <StyledMainButtonContainer>
                  {isPasswordUpdated ? (
                    <>
                      <CaptchaCheckbox
                        challengeKey={`password-reset-sign-in:${isOnAWorkspace ? (workspacePublicData?.id ?? window.location.origin) : 'global'}:${email}`}
                      />
                      <MainButton
                        variant="primary"
                        title={t`Sign in`}
                        type="button"
                        fullWidth
                        disabled={isSigningIn || !isCaptchaReady}
                        onClick={signInAfterPasswordUpdate}
                      />
                    </>
                  ) : (
                    <MainButton
                      variant="secondary"
                      title={passwordActionLabel}
                      type="submit"
                      fullWidth
                      disabled={isUpdatingPassword}
                    />
                  )}
                </StyledMainButtonContainer>
              </StyledForm>
            )}
          </StyledOnboardingContentContainer>
        </StyledMainContainer>
      </ModalContent>
    )
  );
};
