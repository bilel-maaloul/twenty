import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { PasswordRequirements } from '@/auth/components/PasswordRequirements';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { motion } from 'framer-motion';
import { Controller, useFormContext } from 'react-hook-form';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledFullWidthMotionDiv = styled(motion.div)`
  width: 100%;
`;

const StyledInputContainer = styled.div`
  margin-bottom: ${themeCssVariables.spacing[3]};
`;

type SignInUpPasswordFieldProps = {
  showErrors: boolean;
  isCreatingPassword: boolean;
  isInvitationPasscode?: boolean;
};

export const SignInUpPasswordField = ({
  showErrors,
  isCreatingPassword,
  isInvitationPasscode = false,
}: SignInUpPasswordFieldProps) => {
  const { t } = useLingui();
  const form = useFormContext<Form>();
  const password = form.watch('password') ?? '';

  return (
    <StyledFullWidthMotionDiv
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{
        type: 'spring',
        stiffness: 800,
        damping: 35,
      }}
    >
      <Controller
        name="password"
        control={form.control}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => (
          <StyledInputContainer>
            <SettingsTextInput
              instanceId="sign-in-up-password"
              autoFocus
              value={value}
              type={isInvitationPasscode ? 'text' : 'password'}
              inputMode={isInvitationPasscode ? 'numeric' : undefined}
              autoComplete={
                isInvitationPasscode ? 'one-time-code' : 'current-password'
              }
              maxLength={isInvitationPasscode ? 6 : undefined}
              aria-label={
                isInvitationPasscode ? t`Invitation code` : t`Password`
              }
              placeholder={
                isInvitationPasscode
                  ? t`Enter the 6-digit code sent to your email`
                  : t`Password`
              }
              onBlur={onBlur}
              onChange={(newValue) =>
                onChange(
                  isInvitationPasscode
                    ? newValue.replace(/\D/g, '').slice(0, 6)
                    : newValue,
                )
              }
              error={showErrors ? error?.message : undefined}
              fullWidth
            />
            {isCreatingPassword && <PasswordRequirements password={password} />}
          </StyledInputContainer>
        )}
      />
    </StyledFullWidthMotionDiv>
  );
};
