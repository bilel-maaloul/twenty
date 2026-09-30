import { SKELETON_LOADER_HEIGHT_SIZES } from '@/activities/components/SkeletonLoader';
import { Logo } from '@/auth/components/Logo';
import { Title } from '@/auth/components/Title';
import { PasswordRequirements } from '@/auth/components/PasswordRequirements';
import { useAuth } from '@/auth/hooks/useAuth';
import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { UPDATE_PASSWORD_VIA_RESET_TOKEN } from '@/auth/graphql/mutations/updatePasswordViaResetToken';
import { PASSWORD_REGEX } from '@/auth/utils/passwordRegex';
import { CaptchaCheckbox } from '@/captcha/components/CaptchaCheckbox';
import { useReadCaptchaToken } from '@/captcha/hooks/useReadCaptchaToken';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
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
import { AppPath } from 'twenty-shared/types';
import { MainButton } from 'twenty-ui/input';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { z } from 'zod';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  type UpdatePasswordViaResetTokenMutation,
  type UpdatePasswordViaResetTokenMutationVariables,
  ValidatePasswordResetTokenDocument,
} from '~/generated-metadata/graphql';
import { useNavigateApp } from '~/hooks/useNavigateApp';

type UpdatePasswordViaResetTokenVariables =
  UpdatePasswordViaResetTokenMutationVariables & {
    captchaToken?: string;
  };

const passwordPolicyMessage = msg`Password must be 8 to 50 characters and include an uppercase letter and a number`;
const passwordConfirmationMessage = msg`Please confirm your password`;
const passwordMismatchMessage = msg`Passwords do not match`;

const validationSchema = z
  .object({
    passwordResetToken: z.string(),
    newPassword: z
      .string()
      .regex(PASSWORD_REGEX, i18n._(passwordPolicyMessage)),
    confirmPassword: z.string().min(1, i18n._(passwordConfirmationMessage)),
  })
  .refine(
    ({ newPassword, confirmPassword }) => newPassword === confirmPassword,
    {
      path: ['confirmPassword'],
      message: i18n._(passwordMismatchMessage),
    },
  )
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

  const navigate = useNavigateApp();

  const [email, setEmail] = useState('');
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isTargetUserPasswordSet, setIsTargetUserPasswordSet] = useState(false);
  const [isPasswordUpdated, setIsPasswordUpdated] = useState(false);
  const passwordResetToken = useParams().passwordResetToken;

  const { control, handleSubmit, watch } = useForm<Form>({
    mode: 'onChange',
    defaultValues: {
      passwordResetToken: passwordResetToken ?? '',
      newPassword: '',
      confirmPassword: '',
    },
    resolver: zodResolver(validationSchema),
  });
  const newPassword = watch('newPassword');

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

  const [updatePasswordViaToken, { loading: isUpdatingPassword }] = useMutation<
    UpdatePasswordViaResetTokenMutation,
    UpdatePasswordViaResetTokenVariables
  >(UPDATE_PASSWORD_VIA_RESET_TOKEN);

  const { clearSession } = useAuth();
  const { readCaptchaToken } = useReadCaptchaToken();
  const { isCaptchaReady } = useCaptcha();

  const onSubmit = async (formData: Form) => {
    try {
      if (!isCaptchaReady) {
        enqueueErrorSnackBar({
          message: t`Complete the CAPTCHA check before continuing.`,
        });
        return;
      }

      const { data } = await updatePasswordViaToken({
        variables: {
          token: formData.passwordResetToken,
          newPassword: formData.newPassword,
          captchaToken: readCaptchaToken(),
        },
      });

      if (!data?.updatePasswordViaResetToken.success) {
        enqueueErrorSnackBar({
          message: t`There was an error while updating password.`,
        });
        return;
      }

      setIsPasswordUpdated(true);
      enqueueSuccessSnackBar({
        message:
          isTargetUserPasswordSet === false
            ? t`Password has been set`
            : t`Password has been updated`,
      });
    } catch (err) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(err) ? err : undefined,
      });
    }
  };

  const passwordActionLabel = isPasswordUpdated
    ? t`Password updated`
    : isTargetUserPasswordSet === true
      ? t`Change Password`
      : t`Set Password`;

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
            ) : isPasswordUpdated ? (
              <StyledForm>
                <p>{t`Your password has been updated. Sign in with your new password.`}</p>
                <StyledMainButtonContainer>
                  <MainButton
                    variant="primary"
                    title={t`Sign in`}
                    type="button"
                    fullWidth
                    onClick={clearSession}
                  />
                </StyledMainButtonContainer>
              </StyledForm>
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
                          <PasswordRequirements password={newPassword} />
                        </StyledInputContainer>
                      )}
                    />
                    <Controller
                      name="confirmPassword"
                      control={control}
                      render={({
                        field: { onChange, onBlur, value },
                        fieldState: { error },
                      }) => (
                        <StyledInputContainer>
                          <TextInput
                            value={value}
                            type="password"
                            placeholder={t`Confirm New Password`}
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

                <StyledMainButtonContainer>
                  <CaptchaCheckbox
                    challengeKey={`password-reset:${workspacePublicData?.id ?? window.location.origin}:${email}`}
                  />
                  <MainButton
                    variant="secondary"
                    title={passwordActionLabel}
                    type="submit"
                    fullWidth
                    disabled={isUpdatingPassword || !isCaptchaReady}
                  />
                </StyledMainButtonContainer>
              </StyledForm>
            )}
          </StyledOnboardingContentContainer>
        </StyledMainContainer>
      </ModalContent>
    )
  );
};
