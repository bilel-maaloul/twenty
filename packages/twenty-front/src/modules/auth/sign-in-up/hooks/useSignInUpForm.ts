import { zodResolver } from '@hookform/resolvers/zod';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { signInUpModeState } from '@/auth/states/signInUpModeState';
import { isInvitationPasscodeModeState } from '@/auth/states/isInvitationPasscodeModeState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import {
  PASSWORD_LENGTH_REGEX,
  PASSWORD_REGEX,
} from '@/auth/utils/passwordRegex';
import { isDeveloperDefaultSignInPrefilledState } from '@/client-config/states/isDeveloperDefaultSignInPrefilledState';
import { isMatchingLocation } from '~/utils/isMatchingLocation';
import { AppPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const makeValidationSchema = (
  signInUpStep: SignInUpStep,
  isCreatingPassword: boolean,
  isInvitationPasscodeMode: boolean,
) =>
  z
    .object({
      email: z
        .string()
        .trim()
        .pipe(z.email({ error: t`Email must be a valid email` })),
      password:
        signInUpStep === SignInUpStep.Password
          ? isInvitationPasscodeMode
            ? z.string().regex(/^\d{6}$/, t`Invitation code must be six digits`)
            : isCreatingPassword
              ? z
                  .string()
                  .regex(
                    PASSWORD_REGEX,
                    t`Password must be 8 to 50 characters and include an uppercase letter and a number`,
                  )
              : z
                  .string()
                  .regex(
                    PASSWORD_LENGTH_REGEX,
                    t`Password must be between 8 and 50 characters`,
                  )
          : z.string().optional(),
    })
    .required();

export type Form = z.infer<ReturnType<typeof makeValidationSchema>>;
export const useSignInUpForm = () => {
  const signInUpStep = useAtomStateValue(signInUpStepState);
  const signInUpMode = useAtomStateValue(signInUpModeState);
  const isInvitationPasscodeMode = useAtomStateValue(
    isInvitationPasscodeModeState,
  );
  const location = useLocation();
  const isInviteMode = isMatchingLocation(location, AppPath.Invite);
  const isCreatingPassword =
    signInUpMode === SignInUpMode.SignUp || isInviteMode;

  const validationSchema = makeValidationSchema(
    signInUpStep,
    isCreatingPassword,
    isInvitationPasscodeMode,
  ); // Create schema based on the current step

  const isDeveloperDefaultSignInPrefilled = useAtomStateValue(
    isDeveloperDefaultSignInPrefilledState,
  );
  const [searchParams] = useSearchParams();
  const prefilledEmail = searchParams.get('email');

  const form = useForm<Form>({
    mode: 'onSubmit',
    defaultValues: {
      email: '',
      password: '',
    },
    resolver: zodResolver(validationSchema),
  });

  useEffect(() => {
    if (isDefined(prefilledEmail)) {
      form.setValue('email', prefilledEmail);
    }

    if (isDeveloperDefaultSignInPrefilled === true) {
      form.setValue('email', prefilledEmail ?? 'tim@apple.dev');
      form.setValue('password', 'tim@apple.dev');
    }
  }, [form, isDeveloperDefaultSignInPrefilled, prefilledEmail]);
  return { form };
};
