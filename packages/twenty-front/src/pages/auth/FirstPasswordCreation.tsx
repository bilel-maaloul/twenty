import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { MainButton } from 'twenty-ui/input';
import { AnimatedEaseIn } from 'twenty-ui/layout';
import { ModalContent } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { z } from 'zod';

import { Logo } from '@/auth/components/Logo';
import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { Title } from '@/auth/components/Title';
import { PASSWORD_REGEX } from '@/auth/utils/passwordRegex';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { TextInput } from '@/ui/input/components/TextInput';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { CreateFirstPasswordDocument } from '~/generated-metadata/graphql';

const passwordLengthMessage = msg`Password must be between 8 and 50 characters`;
const passwordsDoNotMatchMessage = msg`Passwords do not match`;

const validationSchema = z
  .object({
    newPassword: z
      .string()
      .regex(PASSWORD_REGEX, i18n._(passwordLengthMessage)),
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
  const [createFirstPassword, { loading }] = useMutation(
    CreateFirstPasswordDocument,
  );
  const { control, handleSubmit, reset } = useForm<Form>({
    mode: 'onChange',
    resolver: zodResolver(validationSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async ({ newPassword, confirmPassword }: Form) => {
    try {
      const result = await createFirstPassword({
        variables: { newPassword, confirmPassword },
      });
      if (result.error) {
        throw result.error;
      }
      if (result.data?.createFirstPassword !== true) {
        throw new Error('First-password creation did not complete');
      }

      reset();
      enqueueSuccessSnackBar({
        message: t`Password created. Sign in with your new password.`,
      });
      navigate(AppPath.SignInUp, { replace: true });
    } catch (error) {
      reset();

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
          message: t`Your first-login link is invalid or expired. Sign in again with your temporary password.`,
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
          <MainButton
            title={t`Create Password`}
            type="submit"
            fullWidth
            disabled={loading}
          />
        </StyledForm>
      </StyledOnboardingContentContainer>
    </ModalContent>
  );
};
