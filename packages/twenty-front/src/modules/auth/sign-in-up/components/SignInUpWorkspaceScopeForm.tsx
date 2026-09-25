import { StyledOnboardingContentContainer } from '@/auth/components/StyledOnboardingContentContainer';
import { SignInUpWithCredentials } from '@/auth/sign-in-up/components/internal/SignInUpWithCredentials';
import { SignInUpWithGoogle } from '@/auth/sign-in-up/components/internal/SignInUpWithGoogle';
import { SignInUpWithMicrosoft } from '@/auth/sign-in-up/components/internal/SignInUpWithMicrosoft';
import { SignInUpWithSso } from '@/auth/sign-in-up/components/internal/SignInUpWithSso';
import { useSignInUpForm } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { useWorkspaceBypass } from '@/auth/sign-in-up/hooks/useWorkspaceBypass';
import { workspaceAuthBypassProvidersState } from '@/workspace/states/workspaceAuthBypassProvidersState';
import { workspaceAuthProvidersState } from '@/workspace/states/workspaceAuthProvidersState';
import { FormProvider } from 'react-hook-form';
import { HorizontalSeparator } from 'twenty-ui/layout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const SignInUpWorkspaceScopeForm = () => {
  const workspaceAuthProviders = useAtomStateValue(workspaceAuthProvidersState);
  const workspaceAuthBypassProviders = useAtomStateValue(
    workspaceAuthBypassProvidersState,
  );
  const { shouldOfferBypass, shouldUseBypass } = useWorkspaceBypass();

  const { form } = useSignInUpForm();

  if (!workspaceAuthProviders) {
    return null;
  }

  const providers =
    shouldOfferBypass && shouldUseBypass
      ? {
          ...workspaceAuthBypassProviders,
          sso: [],
        }
      : workspaceAuthProviders;

  return (
    <>
      <StyledOnboardingContentContainer>
        {providers.google && <SignInUpWithGoogle action="join-workspace" />}

        {providers.microsoft && (
          <SignInUpWithMicrosoft action="join-workspace" />
        )}

        {providers.sso.length > 0 && <SignInUpWithSso />}

        {(providers.google ||
          providers.microsoft ||
          providers.sso.length > 0) &&
        providers.password ? (
          <HorizontalSeparator />
        ) : null}
        {providers.password && (
          // oxlint-disable-next-line react/jsx-props-no-spreading
          <FormProvider {...form}>
            <SignInUpWithCredentials />
          </FormProvider>
        )}
      </StyledOnboardingContentContainer>
    </>
  );
};
