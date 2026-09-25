import { act, renderHook } from '@testing-library/react';
import { type UseFormReturn } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Provider as JotaiProvider } from 'jotai';

import { useAuth } from '@/auth/hooks/useAuth';
import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';
import { useSignInUp } from '@/auth/sign-in-up/hooks/useSignInUp';
import { AppPath } from 'twenty-shared/types';
import { signInUpModeState } from '@/auth/states/signInUpModeState';
import {
  SignInUpStep,
  signInUpStepState,
} from '@/auth/states/signInUpStepState';
import { workspacePublicDataState } from '@/auth/states/workspacePublicDataState';
import { SignInUpMode } from '@/auth/types/signInUpMode';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { type PublicWorkspaceData } from '~/generated-metadata/graphql';

jest.mock('@/auth/hooks/useAuth', () => ({ useAuth: jest.fn() }));

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({
    isOnAWorkspace: mockIsOnAWorkspace,
  }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock('@/client-config/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ isCaptchaReady: true }),
}));

jest.mock('@/captcha/hooks/useReadCaptchaToken', () => ({
  useReadCaptchaToken: () => ({ readCaptchaToken: () => 'captcha-token' }),
}));

jest.mock(
  '@/domain-manager/hooks/useBuildSearchParamsFromUrlSyncedStates',
  () => ({
    useBuildSearchParamsFromUrlSyncedStates: () => ({
      buildSearchParamsFromUrlSyncedStates: async () => ({}),
    }),
  }),
);

const signUpWithCredentialsMock = jest.fn();
const signUpWithCredentialsInWorkspaceMock = jest.fn();
const signInWithCredentialsMock = jest.fn();
const signInWithCredentialsInWorkspaceMock = jest.fn();
const checkUserExistsQueryMock = jest.fn();
let mockIsOnAWorkspace = true;

(useAuth as jest.Mock).mockReturnValue({
  signInWithCredentialsInWorkspace: signInWithCredentialsInWorkspaceMock,
  signInWithCredentials: signInWithCredentialsMock,
  signUpWithCredentialsInWorkspace: signUpWithCredentialsInWorkspaceMock,
  signUpWithCredentials: signUpWithCredentialsMock,
  checkUserExists: { checkUserExistsQuery: checkUserExistsQueryMock },
});

const credentials: Form = {
  email: 'someone@example.com',
  password: 'Passw0rd!',
};

const renderUseSignInUp = (
  workspacePublicData: PublicWorkspaceData | null,
  initialEntry = '/',
) => {
  jotaiStore.set(workspacePublicDataState.atom, workspacePublicData);
  jotaiStore.set(signInUpModeState.atom, SignInUpMode.SignUp);

  return renderHook(
    () =>
      useSignInUp({
        getValues: () => 'someone@example.com',
      } as unknown as UseFormReturn<Form>),
    {
      wrapper: ({ children }) => (
        <JotaiProvider store={jotaiStore}>
          <I18nProvider i18n={i18n}>
            <MemoryRouter initialEntries={[initialEntry]}>
              {children}
            </MemoryRouter>
          </I18nProvider>
        </JotaiProvider>
      ),
    },
  );
};

describe('useSignInUp > submitCredentials > sign-up routing', () => {
  beforeEach(() => {
    resetJotaiStore();
    jest.clearAllMocks();
    mockIsOnAWorkspace = true;
  });

  it('advances from email locally without checking whether the account exists', async () => {
    const { result } = renderUseSignInUp(null);
    jotaiStore.set(signInUpStepState.atom, SignInUpStep.Email);

    await act(() => result.current.continueWithCredentials());

    expect(checkUserExistsQueryMock).not.toHaveBeenCalled();
    expect(jotaiStore.get(signInUpModeState.atom)).toBe(SignInUpMode.SignIn);
    expect(jotaiStore.get(signInUpStepState.atom)).toBe(SignInUpStep.Password);
  });

  it('uses guarded workspace sign-in with the one-use CAPTCHA response', async () => {
    const { result } = renderUseSignInUp(null);
    await act(() => result.current.continueWithCredentials());

    await act(() => result.current.submitCredentials(credentials));

    expect(signInWithCredentialsInWorkspaceMock).toHaveBeenCalledWith(
      'someone@example.com',
      'Passw0rd!',
      'captcha-token',
    );
    expect(checkUserExistsQueryMock).not.toHaveBeenCalled();
  });

  it('uses guarded workspace-agnostic sign-in with the CAPTCHA response', async () => {
    mockIsOnAWorkspace = false;
    const { result } = renderUseSignInUp(null);
    await act(() => result.current.continueWithCredentials());

    await act(() => result.current.submitCredentials(credentials));

    expect(signInWithCredentialsMock).toHaveBeenCalledWith(
      'someone@example.com',
      'Passw0rd!',
      'captcha-token',
    );
    expect(checkUserExistsQueryMock).not.toHaveBeenCalled();
  });

  it('signs up in the workspace when the location resolves one, so its approved access domains are checked', async () => {
    const { result } = renderUseSignInUp({
      id: 'workspace-id',
    } as PublicWorkspaceData);

    await act(() => result.current.submitCredentials(credentials));

    expect(signUpWithCredentialsInWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'someone@example.com',
        password: 'Passw0rd!',
        captchaToken: 'captcha-token',
      }),
    );
    expect(signUpWithCredentialsInWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(signUpWithCredentialsMock).not.toHaveBeenCalled();
  });

  it('signs up without a workspace when the location has none yet', async () => {
    const { result } = renderUseSignInUp(null);

    await act(() => result.current.submitCredentials(credentials));

    expect(signUpWithCredentialsMock).toHaveBeenCalledWith(
      'someone@example.com',
      'Passw0rd!',
      'captcha-token',
    );
    expect(signUpWithCredentialsMock).toHaveBeenCalledTimes(1);
    expect(signUpWithCredentialsInWorkspaceMock).not.toHaveBeenCalled();
  });

  it('submits invitations through the guarded workspace mutation with the CAPTCHA response', async () => {
    const invitationPath = AppPath.Invite.replace(
      ':workspaceInviteHash',
      'invite-hash',
    );
    const { result } = renderUseSignInUp(
      null,
      `${invitationPath}?inviteToken=personal-token`,
    );

    await act(() => result.current.submitCredentials(credentials));

    expect(signUpWithCredentialsInWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ captchaToken: 'captcha-token' }),
    );
    expect(signUpWithCredentialsMock).not.toHaveBeenCalled();
  });
});
