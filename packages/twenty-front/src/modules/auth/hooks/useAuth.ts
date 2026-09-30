import {
  useApolloClient,
  useLazyQuery,
  useMutation,
} from '@apollo/client/react';
import { useCallback } from 'react';
import { AppPath } from 'twenty-shared/types';

import { REACT_APP_SERVER_BASE_URL } from '~/config';
import {
  type AuthToken,
  CheckUserExistsDocument,
  GetAuthTokensFromLoginTokenDocument,
  GetAuthTokensFromOtpDocument,
  GetLoginTokenFromCredentialsDocument,
  ResendInteractiveEmailOtpDocument,
  GetWorkspaceCreationDefaultsDocument,
  SignInDocument,
  SignOutDocument,
  SignUpInWorkspaceDocument,
  SignUpDocument,
  VerifyEmailAndGetLoginTokenDocument,
  VerifyEmailAndGetWorkspaceAgnosticTokenDocument,
  VerifyFirstPasswordInvitationPasscodeDocument,
  VerifyInteractiveEmailOtpDocument,
} from '~/generated-metadata/graphql';

import { useMarkSessionActive } from '@/auth/hooks/useMarkSessionActive';
import { currentUserState } from '@/auth/states/currentUserState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { clearSessionLocalStorageKeys } from '@/auth/utils/clearSessionLocalStorageKeys';
import { broadcastSignOutToOtherTabs } from '@/auth/utils/crossTabSignOut';
import { clearSessionGeneration } from '@/auth/utils/clearSessionGeneration';
import { isValidReturnToPath } from '@/auth/utils/isValidReturnToPath';
import { isNonEmptyString } from '@sniptt/guards';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';

import { isAppEffectRedirectEnabledState } from '@/app/states/isAppEffectRedirectEnabledState';
import { loginTokenState } from '@/auth/states/loginTokenState';
import { interactiveEmailOtpChallengeIdState } from '@/auth/states/interactiveEmailOtpChallengeIdState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { type BillingCheckoutSession } from '@/auth/types/billingCheckoutSession.type';
import {
  countAvailableWorkspaces,
  getFirstAvailableWorkspaces,
} from '@/auth/utils/availableWorkspacesUtils';
import { isEmailVerificationRequiredState } from '@/client-config/states/isEmailVerificationRequiredState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { useLastAuthenticatedWorkspaceDomain } from '@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain';
import { useOrigin } from '@/domain-manager/hooks/useOrigin';
import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { useRedirectToWorkspaceDomain } from '@/domain-manager/hooks/useRedirectToWorkspaceDomain';
import { useLoadCurrentUser } from '@/users/hooks/useLoadCurrentUser';
import { i18n } from '@lingui/core';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { isDefined } from 'twenty-shared/utils';
import { getWorkspaceUrl } from '~/utils/getWorkspaceUrl';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { useStore } from 'jotai';

type CredentialSignInOutcome =
  | 'normal'
  | 'first-password-required'
  | 'email-otp-required'
  | 'password-expired';

export const useAuth = () => {
  const store = useStore();
  const markSessionActive = useMarkSessionActive();
  const setLoginToken = useSetAtomState(loginTokenState);
  const setIsAppEffectRedirectEnabled = useSetAtomState(
    isAppEffectRedirectEnabledState,
  );

  const { origin } = useOrigin();
  const isMultiWorkspaceEnabled = useAtomStateValue(
    isMultiWorkspaceEnabledState,
  );
  const isEmailVerificationRequired = useAtomStateValue(
    isEmailVerificationRequiredState,
  );
  const { loadCurrentUser } = useLoadCurrentUser();
  const apolloClient = useApolloClient();

  const setSignInUpStep = useSetAtomState(signInUpStepState);
  const setEmailOtpChallengeId = useSetAtomState(
    interactiveEmailOtpChallengeIdState,
  );
  const { redirect } = useRedirect();
  const { redirectToWorkspaceDomain } = useRedirectToWorkspaceDomain();

  const [getLoginTokenFromCredentials] = useMutation(
    GetLoginTokenFromCredentialsDocument,
  );
  const [signIn] = useMutation(SignInDocument);
  const [signUp] = useMutation(SignUpDocument);
  const [signUpInWorkspace] = useMutation(SignUpInWorkspaceDocument);
  const [getAuthTokensFromLoginToken] = useMutation(
    GetAuthTokensFromLoginTokenDocument,
  );
  const [verifyEmailAndGetLoginToken] = useMutation(
    VerifyEmailAndGetLoginTokenDocument,
  );
  const [verifyEmailAndGetWorkspaceAgnosticToken] = useMutation(
    VerifyEmailAndGetWorkspaceAgnosticTokenDocument,
  );
  const [verifyFirstPasswordInvitationPasscodeMutation] = useMutation(
    VerifyFirstPasswordInvitationPasscodeDocument,
  );
  const [getAuthTokensFromOtp] = useMutation(GetAuthTokensFromOtpDocument);
  const [verifyInteractiveEmailOtpMutation] = useMutation(
    VerifyInteractiveEmailOtpDocument,
  );
  const [resendInteractiveEmailOtpMutation] = useMutation(
    ResendInteractiveEmailOtpDocument,
  );
  const [signOutMutation] = useMutation(SignOutDocument);

  const workspacePublicData = useAtomStateValue(workspacePublicDataState);

  const { setLastAuthenticateWorkspaceDomain } =
    useLastAuthenticatedWorkspaceDomain();
  const [checkUserExistsQuery, { data: checkUserExistsData }] = useLazyQuery(
    CheckUserExistsDocument,
  );

  const [, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const handleVerifyFirstPasswordInvitationPasscode = useCallback(
    async (email: string, passcode: string) => {
      const result = await verifyFirstPasswordInvitationPasscodeMutation({
        variables: { email, passcode, origin },
      });

      if (isDefined(result.error)) {
        throw result.error;
      }

      if (result.data?.verifyFirstPasswordInvitationPasscode !== true) {
        throw new Error('Invitation passcode verification failed');
      }

      navigate(AppPath.CreateFirstPassword);
    },
    [verifyFirstPasswordInvitationPasscodeMutation, origin, navigate],
  );

  const startEmailOtpChallenge = useCallback(
    (challengeId: string) => {
      setEmailOtpChallengeId(challengeId);
      setSignInUpStep(SignInUpStep.EmailOtpVerification);
    },
    [setEmailOtpChallengeId, setSignInUpStep],
  );

  const clearSession = useCallback(() => {
    // The assign below is the only navigation: keep the redirect effect from
    // racing it to the sign-in page once the session is cleared.
    store.set(isAppEffectRedirectEnabledState.atom, false);
    sessionStorage.clear();
    store.set(isCookieAuthActiveState.atom, false);
    store.set(currentUserState.atom, null);
    store.set(currentWorkspaceState.atom, null);
    store.set(currentWorkspaceMemberState.atom, null);
    store.set(currentUserWorkspaceState.atom, null);
    clearSessionGeneration();
    clearSessionLocalStorageKeys();
    setLastAuthenticateWorkspaceDomain(null);
    window.location.assign(AppPath.SignInUp);
  }, [store, setLastAuthenticateWorkspaceDomain]);

  const navigateAfterMultiWorkspaceSignInUp = useCallback(
    async (
      availableWorkspaces: Parameters<typeof countAvailableWorkspaces>[0],
      email: string,
    ) => {
      const availableWorkspacesCount =
        countAvailableWorkspaces(availableWorkspaces);

      // The in-app "Create Workspace" entry point redirects here with this
      // signal so an existing user with workspaces lands on the creation form
      // instead of the workspace selection step.
      const wantsToCreateNewWorkspace =
        new URLSearchParams(window.location.search).get('action') ===
        'create-new-workspace';

      if (availableWorkspacesCount === 0 || wantsToCreateNewWorkspace) {
        await apolloClient.query({
          query: GetWorkspaceCreationDefaultsDocument,
        });
        setSignInUpStep(SignInUpStep.WorkspaceCreation);
        return;
      }

      if (availableWorkspacesCount === 1) {
        const targetWorkspace =
          getFirstAvailableWorkspaces(availableWorkspaces);

        return await redirectToWorkspaceDomain(
          getWorkspaceUrl(targetWorkspace.workspaceUrls),
          targetWorkspace.loginToken ? AppPath.Verify : AppPath.SignInUp,
          {
            ...(targetWorkspace.loginToken && {
              loginToken: targetWorkspace.loginToken,
            }),
            email,
          },
        );
      }

      setSignInUpStep(SignInUpStep.WorkspaceSelection);
    },
    [apolloClient, redirectToWorkspaceDomain, setSignInUpStep],
  );

  const handleGetLoginTokenFromCredentials = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      try {
        const getLoginTokenResult = await getLoginTokenFromCredentials({
          variables: {
            email,
            password,
            captchaToken,
            origin,
          },
        });
        if (isDefined(getLoginTokenResult.error)) {
          throw getLoginTokenResult.error;
        }

        if (!getLoginTokenResult.data?.getLoginTokenFromCredentials) {
          throw new Error('No login token');
        }

        return getLoginTokenResult.data.getLoginTokenFromCredentials;
      } catch (error) {
        if (isGraphqlErrorOfType(error, 'EMAIL_NOT_VERIFIED')) {
          setSearchParams({ email });
          setSignInUpStep(SignInUpStep.EmailVerification);
          throw error;
        }
        throw error;
      }
    },
    [getLoginTokenFromCredentials, setSearchParams, setSignInUpStep, origin],
  );

  const handleverifyEmailAndGetLoginToken = useCallback(
    async (
      emailVerificationToken: string,
      email: string,
      captchaToken?: string,
    ) => {
      const loginTokenResult = await verifyEmailAndGetLoginToken({
        variables: {
          email,
          emailVerificationToken,
          captchaToken,
          origin,
        },
      });

      if (isDefined(loginTokenResult.error)) {
        throw loginTokenResult.error;
      }

      if (!loginTokenResult.data?.verifyEmailAndGetLoginToken) {
        throw new Error('No login token');
      }

      return loginTokenResult.data.verifyEmailAndGetLoginToken;
    },
    [verifyEmailAndGetLoginToken, origin],
  );

  const handleverifyEmailAndGetWorkspaceAgnosticToken = useCallback(
    async (
      emailVerificationToken: string,
      email: string,
      captchaToken?: string,
    ) => {
      const { data, error } = await verifyEmailAndGetWorkspaceAgnosticToken({
        variables: {
          email,
          emailVerificationToken,
          captchaToken,
        },
      });

      if (isDefined(error)) {
        throw error;
      }

      if (!data?.verifyEmailAndGetWorkspaceAgnosticToken) {
        throw new Error('No workspace agnostic token in result');
      }

      const verificationResult = data.verifyEmailAndGetWorkspaceAgnosticToken;

      if (verificationResult.requiresEmailOtp) {
        if (!verificationResult.emailOtpChallengeId) {
          throw new Error('No email OTP challenge');
        }

        startEmailOtpChallenge(verificationResult.emailOtpChallengeId);
        return;
      }

      if (!verificationResult.tokens) {
        throw new Error('No authentication token pair');
      }

      markSessionActive();

      const { user } = await loadCurrentUser();

      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    },
    [
      verifyEmailAndGetWorkspaceAgnosticToken,
      markSessionActive,
      loadCurrentUser,
      navigateAfterMultiWorkspaceSignInUp,
      startEmailOtpChallenge,
    ],
  );

  const handleSetLoginToken = useCallback(
    (token: AuthToken['token']) => {
      setLoginToken(token);
    },
    [setLoginToken],
  );

  const handleLoadWorkspaceAfterAuthentication = useCallback(async () => {
    markSessionActive();
    setIsAppEffectRedirectEnabled(false);

    try {
      await loadCurrentUser();
    } finally {
      setIsAppEffectRedirectEnabled(true);
    }
  }, [loadCurrentUser, markSessionActive, setIsAppEffectRedirectEnabled]);

  const handleGetAuthTokensFromLoginToken = useCallback(
    async (loginToken: string) => {
      try {
        const getAuthTokensResult = await getAuthTokensFromLoginToken({
          variables: {
            loginToken: loginToken,
            origin,
          },
        });

        if (isDefined(getAuthTokensResult.error)) {
          throw getAuthTokensResult.error;
        }

        if (!getAuthTokensResult.data?.getAuthTokensFromLoginToken) {
          throw new Error('No getAuthTokensFromLoginToken result');
        }

        const authenticationResult =
          getAuthTokensResult.data.getAuthTokensFromLoginToken;

        if (authenticationResult.requiresEmailOtp) {
          if (!authenticationResult.emailOtpChallengeId) {
            throw new Error('No email OTP challenge');
          }

          startEmailOtpChallenge(authenticationResult.emailOtpChallengeId);
          navigate(AppPath.SignInUp);
          return;
        }

        if (!authenticationResult.tokens) {
          throw new Error('No authentication token pair');
        }

        await handleLoadWorkspaceAfterAuthentication();
      } catch (error) {
        if (
          isGraphqlErrorOfType(
            error,
            'TWO_FACTOR_AUTHENTICATION_PROVISION_REQUIRED',
          )
        ) {
          handleSetLoginToken(loginToken);
          navigate(AppPath.SignInUp);
          setSignInUpStep(SignInUpStep.TwoFactorAuthenticationProvision);
          return;
        }

        if (
          isGraphqlErrorOfType(
            error,
            'TWO_FACTOR_AUTHENTICATION_VERIFICATION_REQUIRED',
          )
        ) {
          handleSetLoginToken(loginToken);
          navigate(AppPath.SignInUp);
          setSignInUpStep(SignInUpStep.TwoFactorAuthenticationVerification);
          return;
        }
        throw error;
      }
    },
    [
      handleSetLoginToken,
      startEmailOtpChallenge,
      getAuthTokensFromLoginToken,
      origin,
      handleLoadWorkspaceAfterAuthentication,
      setSignInUpStep,
      navigate,
    ],
  );

  const handleCredentialsSignIn = useCallback(
    async (
      email: string,
      password: string,
      captchaToken?: string,
    ): Promise<CredentialSignInOutcome> => {
      try {
        const result = await signIn({
          variables: { email, password, captchaToken },
        });

        if (isDefined(result.error)) {
          throw result.error;
        }

        if (!result.data?.signIn) {
          throw new Error('No signIn result');
        }

        if (result.data.signIn.requiresFirstPasswordCreation) {
          navigate(AppPath.CreateFirstPassword);
          return 'first-password-required';
        }

        if (result.data.signIn.requiresPasswordReset) {
          return 'password-expired';
        }

        if (result.data.signIn.requiresEmailOtp) {
          if (!result.data.signIn.emailOtpChallengeId) {
            throw new Error('No email OTP challenge');
          }

          startEmailOtpChallenge(result.data.signIn.emailOtpChallengeId);
          return 'email-otp-required';
        }

        if (!result.data.signIn.tokens) {
          throw new Error('No authentication token pair');
        }

        markSessionActive();
        const { user } = await loadCurrentUser();

        await navigateAfterMultiWorkspaceSignInUp(
          user.availableWorkspaces,
          user.email,
        );
        return 'normal';
      } catch (error) {
        if (isGraphqlErrorOfType(error, 'EMAIL_NOT_VERIFIED')) {
          setSearchParams({ email });
          setSignInUpStep(SignInUpStep.EmailVerification);
        }
        throw error;
      }
    },
    [
      markSessionActive,
      signIn,
      loadCurrentUser,
      setSearchParams,
      setSignInUpStep,
      navigateAfterMultiWorkspaceSignInUp,
      navigate,
      startEmailOtpChallenge,
    ],
  );

  const completeFirstPasswordSignIn = useCallback(async () => {
    markSessionActive();
    const { user } = await loadCurrentUser();

    if (!isMultiWorkspaceEnabled || isDefined(user.currentWorkspace)) {
      navigate(AppPath.Index, { replace: true });
      return;
    }

    await navigateAfterMultiWorkspaceSignInUp(
      user.availableWorkspaces,
      user.email,
    );
  }, [
    isMultiWorkspaceEnabled,
    markSessionActive,
    loadCurrentUser,
    navigateAfterMultiWorkspaceSignInUp,
    navigate,
  ]);

  const handleCredentialsSignUp = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      const signUpResult = await signUp({
        variables: {
          email,
          password,
          captchaToken,
          locale: i18n.locale ?? SOURCE_LOCALE,
        },
      });

      if (isDefined(signUpResult.error)) {
        throw signUpResult.error;
      }

      if (isEmailVerificationRequired) {
        setSearchParams({ email });
        setSignInUpStep(SignInUpStep.EmailVerification);
        return null;
      }

      if (!signUpResult.data?.signUp) {
        throw new Error('No signUp result');
      }

      if (signUpResult.data.signUp.requiresEmailOtp) {
        if (!signUpResult.data.signUp.emailOtpChallengeId) {
          throw new Error('No email OTP challenge');
        }

        startEmailOtpChallenge(signUpResult.data.signUp.emailOtpChallengeId);
        return null;
      }

      if (!signUpResult.data.signUp.tokens) {
        throw new Error('No authentication token pair');
      }

      markSessionActive();

      const { user } = await loadCurrentUser();

      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    },
    [
      isEmailVerificationRequired,
      setSearchParams,
      markSessionActive,
      signUp,
      loadCurrentUser,
      setSignInUpStep,
      navigateAfterMultiWorkspaceSignInUp,
      startEmailOtpChallenge,
    ],
  );

  const handleCredentialsSignInInWorkspace = useCallback(
    async (
      email: string,
      password: string,
      captchaToken?: string,
    ): Promise<CredentialSignInOutcome> => {
      const result = await handleGetLoginTokenFromCredentials(
        email,
        password,
        captchaToken,
      );
      if (result.requiresFirstPasswordCreation) {
        navigate(AppPath.CreateFirstPassword);
        return 'first-password-required';
      }
      if (result.requiresPasswordReset) {
        return 'password-expired';
      }

      if (result.requiresEmailOtp) {
        if (!result.emailOtpChallengeId) {
          throw new Error('No email OTP challenge');
        }

        startEmailOtpChallenge(result.emailOtpChallengeId);
        return 'email-otp-required';
      }
      if (!result.loginToken) {
        throw new Error('No login token');
      }
      await handleGetAuthTokensFromLoginToken(result.loginToken.token);
      return 'normal';
    },
    [
      handleGetLoginTokenFromCredentials,
      handleGetAuthTokensFromLoginToken,
      navigate,
      startEmailOtpChallenge,
    ],
  );

  const handleSignOut = useCallback(async () => {
    // Before clearSession, whose navigation kills in-flight requests.
    store.set(isPendingServerSignOutState.atom, true);

    try {
      await signOutMutation();
      store.set(isPendingServerSignOutState.atom, false);
    } catch {}

    broadcastSignOutToOtherTabs();
    clearSession();
  }, [clearSession, signOutMutation, store]);

  const handleCredentialsSignUpInWorkspace = useCallback(
    async ({
      email,
      password,
      workspaceInviteHash,
      workspacePersonalInviteToken,
      captchaToken,
      verifyEmailRedirectPath,
    }: {
      email: string;
      password: string;
      workspaceInviteHash?: string;
      workspacePersonalInviteToken?: string;
      captchaToken?: string;
      verifyEmailRedirectPath?: string;
    }) => {
      const signUpInWorkspaceResult = await signUpInWorkspace({
        variables: {
          email,
          password,
          workspaceInviteHash,
          workspacePersonalInviteToken,
          captchaToken,
          locale: i18n.locale ?? SOURCE_LOCALE,
          ...(workspacePublicData?.id
            ? { workspaceId: workspacePublicData.id }
            : {}),
          verifyEmailRedirectPath,
        },
      });

      if (isDefined(signUpInWorkspaceResult.error)) {
        throw signUpInWorkspaceResult.error;
      }

      if (!signUpInWorkspaceResult.data?.signUpInWorkspace) {
        throw new Error('No login token');
      }

      if (isEmailVerificationRequired) {
        setSearchParams({ email });
        setSignInUpStep(SignInUpStep.EmailVerification);
        return null;
      }

      if (isMultiWorkspaceEnabled) {
        return await redirectToWorkspaceDomain(
          getWorkspaceUrl(
            signUpInWorkspaceResult.data.signUpInWorkspace.workspace
              .workspaceUrls,
          ),
          isEmailVerificationRequired ? AppPath.SignInUp : AppPath.Verify,
          {
            ...(!isEmailVerificationRequired && {
              loginToken:
                signUpInWorkspaceResult.data.signUpInWorkspace.loginToken.token,
            }),
            email,
          },
        );
      }

      await handleGetAuthTokensFromLoginToken(
        signUpInWorkspaceResult.data?.signUpInWorkspace.loginToken.token,
      );
    },
    [
      signUpInWorkspace,
      workspacePublicData,
      isMultiWorkspaceEnabled,
      handleGetAuthTokensFromLoginToken,
      setSignInUpStep,
      setSearchParams,
      isEmailVerificationRequired,
      redirectToWorkspaceDomain,
    ],
  );

  const buildRedirectUrl = useCallback(
    (
      path: string,
      params: {
        workspacePersonalInviteToken?: string;
        workspaceInviteHash?: string;
        billingCheckoutSession?: BillingCheckoutSession;
        action?: string;
      },
    ) => {
      const url = new URL(`${REACT_APP_SERVER_BASE_URL}${path}`);
      if (isDefined(params.workspaceInviteHash)) {
        url.searchParams.set('workspaceInviteHash', params.workspaceInviteHash);
      }
      if (isDefined(params.workspacePersonalInviteToken)) {
        url.searchParams.set(
          'inviteToken',
          params.workspacePersonalInviteToken,
        );
      }
      if (isDefined(params.billingCheckoutSession)) {
        url.searchParams.set(
          'billingCheckoutSessionState',
          JSON.stringify(params.billingCheckoutSession),
        );
      }

      if (isDefined(params.action)) {
        url.searchParams.set('action', params.action);
      }

      if (isDefined(workspacePublicData)) {
        url.searchParams.set('workspaceId', workspacePublicData.id);
      }

      const returnToPath = store.get(returnToPathState.atom);

      if (isNonEmptyString(returnToPath) && isValidReturnToPath(returnToPath)) {
        url.searchParams.set('returnToPath', returnToPath);
      }

      return url.toString();
    },
    [workspacePublicData, store],
  );

  const handleGoogleLogin = useCallback(
    (params: {
      workspacePersonalInviteToken?: string;
      workspaceInviteHash?: string;
      billingCheckoutSession?: BillingCheckoutSession;
      action: string;
    }) => {
      redirect(buildRedirectUrl('/auth/google', params));
    },
    [buildRedirectUrl, redirect],
  );

  const handleMicrosoftLogin = useCallback(
    (params: {
      workspacePersonalInviteToken?: string;
      workspaceInviteHash?: string;
      billingCheckoutSession?: BillingCheckoutSession;
      action: string;
    }) => {
      redirect(buildRedirectUrl('/auth/microsoft', params));
    },
    [buildRedirectUrl, redirect],
  );

  const handleGetAuthTokensFromOTP = useCallback(
    async (otp: string, loginToken: string, captchaToken?: string) => {
      const getAuthTokensFromOtpResult = await getAuthTokensFromOtp({
        variables: {
          captchaToken,
          origin,
          otp,
          loginToken,
        },
      });

      if (isDefined(getAuthTokensFromOtpResult.error)) {
        throw getAuthTokensFromOtpResult.error;
      }

      if (!getAuthTokensFromOtpResult.data?.getAuthTokensFromOTP) {
        throw new Error('No getAuthTokensFromOTP result');
      }

      const authenticationResult =
        getAuthTokensFromOtpResult.data.getAuthTokensFromOTP;

      if (authenticationResult.requiresEmailOtp) {
        if (!authenticationResult.emailOtpChallengeId) {
          throw new Error('No email OTP challenge');
        }

        startEmailOtpChallenge(authenticationResult.emailOtpChallengeId);
        navigate(AppPath.SignInUp);
        return;
      }

      if (!authenticationResult.tokens) {
        throw new Error('No authentication token pair');
      }

      await handleLoadWorkspaceAfterAuthentication();
    },
    [
      getAuthTokensFromOtp,
      origin,
      handleLoadWorkspaceAfterAuthentication,
      startEmailOtpChallenge,
      navigate,
    ],
  );

  const handleVerifyInteractiveEmailOtp = useCallback(
    async (challengeId: string, code: string) => {
      const result = await verifyInteractiveEmailOtpMutation({
        variables: { challengeId, code, origin },
      });

      if (isDefined(result.error)) {
        throw result.error;
      }

      const verificationResult = result.data?.verifyInteractiveEmailOtp;

      if (!verificationResult) {
        throw new Error('No email OTP verification result');
      }

      setEmailOtpChallengeId(null);

      if (verificationResult.loginToken) {
        await handleGetAuthTokensFromLoginToken(
          verificationResult.loginToken.token,
        );
        return;
      }

      if (!verificationResult.tokens) {
        throw new Error('No authentication token pair');
      }

      markSessionActive();
      const { user } = await loadCurrentUser();

      await navigateAfterMultiWorkspaceSignInUp(
        user.availableWorkspaces,
        user.email,
      );
    },
    [
      verifyInteractiveEmailOtpMutation,
      origin,
      setEmailOtpChallengeId,
      handleGetAuthTokensFromLoginToken,
      markSessionActive,
      loadCurrentUser,
      navigateAfterMultiWorkspaceSignInUp,
    ],
  );

  const handleResendInteractiveEmailOtp = useCallback(
    async (challengeId: string) => {
      const result = await resendInteractiveEmailOtpMutation({
        variables: { challengeId },
      });

      if (isDefined(result.error)) {
        throw result.error;
      }

      if (!result.data?.resendInteractiveEmailOtp) {
        throw new Error('No email OTP resend result');
      }
    },
    [resendInteractiveEmailOtpMutation],
  );

  return {
    getLoginTokenFromCredentials: handleGetLoginTokenFromCredentials,
    verifyEmailAndGetWorkspaceAgnosticToken:
      handleverifyEmailAndGetWorkspaceAgnosticToken,
    verifyEmailAndGetLoginToken: handleverifyEmailAndGetLoginToken,
    getAuthTokensFromLoginToken: handleGetAuthTokensFromLoginToken,
    checkUserExists: { checkUserExistsData, checkUserExistsQuery },
    clearSession,
    signOut: handleSignOut,
    signUpWithCredentials: handleCredentialsSignUp,
    signUpWithCredentialsInWorkspace: handleCredentialsSignUpInWorkspace,
    signInWithCredentialsInWorkspace: handleCredentialsSignInInWorkspace,
    signInWithCredentials: handleCredentialsSignIn,
    completeFirstPasswordSignIn,
    verifyFirstPasswordInvitationPasscode:
      handleVerifyFirstPasswordInvitationPasscode,
    signInWithGoogle: handleGoogleLogin,
    signInWithMicrosoft: handleMicrosoftLogin,
    getAuthTokensFromOTP: handleGetAuthTokensFromOTP,
    verifyInteractiveEmailOtp: handleVerifyInteractiveEmailOtp,
    resendInteractiveEmailOtp: handleResendInteractiveEmailOtp,
    navigateAfterMultiWorkspaceSignInUp,
  };
};
