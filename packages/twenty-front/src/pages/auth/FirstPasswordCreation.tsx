import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppPath } from 'twenty-shared/types';
import { MainButton } from 'twenty-ui/input';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { ModalContent } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { z } from 'zod';

import { Logo } from '@/auth/components/Logo';
import { PasswordRequirements } from '@/auth/components/PasswordRequirements';
import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { Title } from '@/auth/components/Title';
import { useAuth } from '@/auth/hooks/useAuth';
import { PASSWORD_REGEX } from '@/auth/utils/passwordRegex';
import { CaptchaCheckbox } from '@/captcha/components/CaptchaCheckbox';
import { useReadCaptchaToken } from '@/captcha/hooks/useReadCaptchaToken';
import { useRequestFreshCaptchaToken } from '@/captcha/hooks/useRequestFreshCaptchaToken';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { TextInput } from '@/ui/input/components/TextInput';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import {
  CreateFirstPasswordDocument,
  HasFirstPasswordCreationCapabilityDocument,
} from '~/generated-metadata/graphql';

const passwordPolicyMessage = msg`Password must be 8 to 50 characters and include an uppercase letter and a number`;
const passwordsDoNotMatchMessage = msg`Passwords do not match`;

const validationSchema = z
  .object({
    newPassword: z
      .string()
      .regex(PASSWORD_REGEX, i18n._(passwordPolicyMessage)),
    confirmPassword: z.string(),
  })
  .refine(
    ({ newPassword, confirmPassword }) => newPassword === confirmPassword,
    {
      path: ['confirmPassword'],
      message: i18n._(passwordsDoNotMatchMessage),
    },
  );

type Form = z.infer<typeof validationSchema>;

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  width: 100%;
`;

export const FirstPasswordCreation = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { completeFirstPasswordSignIn } = useAuth();
  const { isCaptchaReady } = useCaptcha();
  const { readCaptchaToken } = useReadCaptchaToken();
  const { requestFreshCaptchaToken } = useRequestFreshCaptchaToken();
  const [createFirstPassword, { loading: isCreatingPassword }] = useMutation(
    CreateFirstPasswordDocument,
  );
  const { data: capabilityData, loading: isCheckingCapability } = useQuery(
    HasFirstPasswordCreationCapabilityDocument,
    { fetchPolicy: 'network-only' },
  );
  const { control, handleSubmit, reset, watch } = useForm<Form>({
    mode: 'onChange',
    resolver: zodResolver(validationSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword');
  const confirmPassword = watch('confirmPassword');
  const hasCapability =
    capabilityData?.hasFirstPasswordCreationCapability === true;

  useEffect(() => {
    if (!isCheckingCapability && !hasCapability) {
      navigate(AppPath.SignInUp, { replace: true });
    }
  }, [hasCapability, isCheckingCapability, navigate]);

  const onSubmit = async ({ newPassword, confirmPassword }: Form) => {
    if (!isCaptchaReady) {
      enqueueErrorSnackBar({
        message: t`Complete the CAPTCHA check before creating your password.`,
      });
      return;
    }

    try {
      const result = await createFirstPassword({
        variables: {
          newPassword,
          confirmPassword,
          captchaToken: readCaptchaToken(),
        },
      });

      if (result.error) {
        throw result.error;
      }

      if (!result.data?.createFirstPassword?.tokens) {
        throw new Error('First-password authentication did not complete');
      }

      reset();
      await completeFirstPasswordSignIn();
      enqueueSuccessSnackBar({
        message: t`Your password is ready. You are signed in.`,
      });
    } catch (error) {
      reset();

      if (isGraphqlErrorOfType(error, 'INVALID_CAPTCHA')) {
        requestFreshCaptchaToken();
        enqueueErrorSnackBar({
          message: t`Complete the CAPTCHA check and try again.`,
        });
        return;
      }

      if (isGraphqlErrorOfType(error, 'INVALID_INPUT')) {
        enqueueErrorSnackBar({
          message: t`Choose a different password and try again.`,
        });
        return;
      }

      if (
        isGraphqlErrorOfType(error, 'FORBIDDEN_EXCEPTION') ||
        isGraphqlErrorOfType(error, 'FORBIDDEN')
      ) {
        enqueueErrorSnackBar({
          message: t`Your first-login invitation is invalid or expired. Ask your administrator to resend it.`,
        });
        navigate(AppPath.SignInUp, { replace: true });
        return;
      }

      enqueueErrorSnackBar({
        message: t`We could not confirm whether your password was changed. Sign in again to check.`,
      });
      navigate(AppPath.SignInUp, { replace: true });
    }
  };

  if (isCheckingCapability || !hasCapability) {
    return null;
  }

  return (
    <ModalContent isVerticallyCentered isHorizontallyCentered>
      <AnimatedEaseIn>
        <Logo />
      </AnimatedEaseIn>
      <Title animate>{t`Create your password`}</Title>
      <StyledOnboardingContentContainer>
        <StyledForm onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name="newPassword"
            control={control}
            render={({ field, fieldState }) => (
              <TextInput
                {...field}
                autoFocus
                type="password"
                autoComplete="new-password"
                placeholder={t`New Password`}
                error={fieldState.error?.message}
                fullWidth
              />
            )}
          />
          <Controller
            name="confirmPassword"
            control={control}
            render={({ field, fieldState }) => (
              <TextInput
                {...field}
                type="password"
                autoComplete="new-password"
                placeholder={t`Confirm Password`}
                error={fieldState.error?.message}
                fullWidth
              />
            )}
          />
          <PasswordRequirements
            password={newPassword}
            confirmPassword={confirmPassword}
          />
          <CaptchaCheckbox challengeKey="first-password-creation" />
          <MainButton
            title={t`Create Password`}
            type="submit"
            fullWidth
            disabled={isCreatingPassword || !isCaptchaReady}
          />
        </StyledForm>
      </StyledOnboardingContentContainer>
    </ModalContent>
  );
};
