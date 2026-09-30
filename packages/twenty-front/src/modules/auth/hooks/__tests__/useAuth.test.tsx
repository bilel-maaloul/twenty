import { useAuth } from '@/auth/hooks/useAuth';

import { MockedProvider } from '@apollo/client/testing/react';
import { type ReactNode, act } from 'react';
import { MemoryRouter } from 'react-router-dom';

import {
  email,
  mocks,
  password,
  results,
  token,
} from '@/auth/hooks/__mocks__/useAuth';
import {
  type CurrentUser,
  currentUserState,
} from '@/auth/states/currentUserState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isMultiWorkspaceEnabledState } from '@/client-config/states/isMultiWorkspaceEnabledState';
import { interactiveEmailOtpChallengeIdState } from '@/auth/states/interactiveEmailOtpChallengeIdState';
import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { renderHook } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { AppPath } from 'twenty-shared/types';

const redirectSpy = jest.fn();
const navigateSpy = jest.fn();
const mockLoadCurrentUser = jest.fn().mockResolvedValue({
  user: {
    email,
    availableWorkspaces: {
      availableWorkspacesForSignIn: [
        {
          workspaceUrls: {
            subdomainUrl: 'https://workspace.example.com',
            customUrl: null,
          },
          loginToken: null,
        },
      ],
      availableWorkspacesForSignUp: [],
    },
  },
});

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
  isNonEmptyString: (value: unknown) =>
    typeof value === 'string' && value.length > 0,
}));

jest.mock('@/users/hooks/useLoadCurrentUser', () => ({
  useLoadCurrentUser: () => ({ loadCurrentUser: mockLoadCurrentUser }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateSpy,
}));

jest.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: jest.fn().mockImplementation(() => ({
    redirect: redirectSpy,
  })),
}));

jest.mock('@/domain-manager/hooks/useOrigin', () => ({
  useOrigin: jest.fn().mockImplementation(() => ({
    origin: 'http://localhost',
  })),
}));

jest.mock('@/captcha/hooks/useRequestFreshCaptchaToken', () => ({
  useRequestFreshCaptchaToken: jest.fn().mockImplementation(() => ({
    requestFreshCaptchaToken: jest.fn(),
  })),
}));

jest.mock('@/auth/sign-in-up/hooks/useSignUpInNewWorkspace', () => ({
  useSignUpInNewWorkspace: jest.fn().mockImplementation(() => ({
    createWorkspace: jest.fn(),
  })),
}));

jest.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: jest.fn().mockImplementation(() => ({
    redirectToWorkspaceDomain: jest.fn(),
  })),
}));

jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: jest.fn().mockImplementation(() => ({
    isOnAWorkspace: true,
  })),
}));

jest.mock('@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain', () => ({
  useLastAuthenticatedWorkspaceDomain: jest.fn().mockImplementation(() => ({
    setLastAuthenticateWorkspaceDomain: jest.fn(),
  })),
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MockedProvider mocks={Object.values(mocks)}>
    <MemoryRouter>
      <SnackBarComponentInstanceContext.Provider
        value={{ instanceId: 'test-instance-id' }}
      >
        {children}
      </SnackBarComponentInstanceContext.Provider>
    </MemoryRouter>
  </MockedProvider>
);

const renderHooks = () => {
  const { result } = renderHook(
    () => {
      return useAuth();
    },
    {
      wrapper: Wrapper,
    },
  );
  return { result };
};

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultStore().set(returnToPathState.atom, '');
    getDefaultStore().set(isCookieAuthActiveState.atom, false);
    getDefaultStore().set(isMultiWorkspaceEnabledState.atom, false);
  });

  it('returns a normal login token from workspace password validation', async () => {
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.getLoginTokenFromCredentials(email, password),
      ).toStrictEqual(results.getLoginTokenFromCredentials);
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
  });

  it('should verify user', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.getAuthTokensFromLoginToken(token);
    });

    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
    expect(mockLoadCurrentUser).toHaveBeenCalled();
  });

  it('completes workspace password sign-in without an email OTP challenge', async () => {
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.signInWithCredentialsInWorkspace(email, password),
      ).toBe('normal');
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
    expect(
      getDefaultStore().get(interactiveEmailOtpChallengeIdState.atom),
    ).toBeNull();
    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
    expect(mockLoadCurrentUser).toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(true);
  });

  it('completes global password sign-in without creating an email OTP challenge', async () => {
    const { result } = renderHooks();

    await act(async () => {
      expect(await result.current.signInWithCredentials(email, password)).toBe(
        'normal',
      );
    });

    expect(mocks.signIn.result).toHaveBeenCalled();
    expect(
      getDefaultStore().get(interactiveEmailOtpChallengeIdState.atom),
    ).toBeNull();
    expect(mockLoadCurrentUser).toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalledWith('/create-first-password');
  });

  it('enters the CRM directly after first-password creation in simple mode', async () => {
    getDefaultStore().set(isMultiWorkspaceEnabledState.atom, false);
    const { result } = renderHooks();

    await act(async () => {
      await result.current.completeFirstPasswordSignIn();
    });

    expect(mockLoadCurrentUser).toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith(AppPath.Index, { replace: true });
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('enters the current workspace directly after first-password creation', async () => {
    getDefaultStore().set(isMultiWorkspaceEnabledState.atom, true);
    mockLoadCurrentUser.mockResolvedValueOnce({
      user: {
        email,
        currentWorkspace: { id: 'invited-workspace-id' },
        availableWorkspaces: {
          availableWorkspacesForSignIn: [],
          availableWorkspacesForSignUp: [],
        },
      },
    });
    const { result } = renderHooks();

    await act(async () => {
      await result.current.completeFirstPasswordSignIn();
    });

    expect(navigateSpy).toHaveBeenCalledWith(AppPath.Index, { replace: true });
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('verifies an invitation passcode before navigating to password creation', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.verifyFirstPasswordInvitationPasscode(
        email,
        '123456',
      );
    });

    expect(
      mocks.verifyFirstPasswordInvitationPasscode.result,
    ).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(AppPath.CreateFirstPassword);
    expect(mocks.signIn.result).not.toHaveBeenCalled();
    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('routes an expired permanent password to reset without creating a session', async () => {
    mocks.signIn.result.mockImplementationOnce(() => ({
      data: {
        signIn: {
          __typename: 'AvailableWorkspacesAndAccessTokens',
          requiresFirstPasswordCreation: false,
          requiresPasswordReset: true,
          requiresEmailOtp: false,
          emailOtpChallengeId: '',
          tokens: null,
          availableWorkspaces: null,
        },
      },
    }));
    const { result } = renderHooks();

    await act(async () => {
      expect(await result.current.signInWithCredentials(email, password)).toBe(
        'password-expired',
      );
    });

    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('routes an expired workspace password to reset before token exchange', async () => {
    mocks.getLoginTokenFromCredentials.result.mockImplementationOnce(() => ({
      data: {
        getLoginTokenFromCredentials: {
          __typename: 'LoginToken',
          requiresFirstPasswordCreation: false,
          requiresPasswordReset: true,
          requiresEmailOtp: false,
          emailOtpChallengeId: '',
          loginToken: null,
        },
      },
    }));
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.signInWithCredentialsInWorkspace(email, password),
      ).toBe('password-expired');
    });

    expect(mocks.getAuthTokensFromLoginToken.result).not.toHaveBeenCalled();
    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('routes restricted workspace sign-in before token exchange', async () => {
    mocks.getLoginTokenFromCredentials.result.mockImplementationOnce(() => ({
      data: {
        getLoginTokenFromCredentials: {
          __typename: 'LoginToken',
          requiresFirstPasswordCreation: true,
          requiresPasswordReset: false,
          requiresEmailOtp: false,
          emailOtpChallengeId: '',
          loginToken: null,
        },
      },
    }));
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.signInWithCredentialsInWorkspace(email, password),
      ).toBe('first-password-required');
    });

    expect(navigateSpy).toHaveBeenCalledWith('/create-first-password');
    expect(mocks.getAuthTokensFromLoginToken.result).not.toHaveBeenCalled();
    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('routes restricted global sign-in before loading user state', async () => {
    mocks.signIn.result.mockImplementationOnce(() => ({
      data: {
        signIn: {
          __typename: 'AvailableWorkspacesAndAccessTokens',
          requiresFirstPasswordCreation: true,
          requiresPasswordReset: false,
          requiresEmailOtp: false,
          emailOtpChallengeId: '',
          availableWorkspaces: null,
          tokens: null,
        },
      },
    }));
    const { result } = renderHooks();

    await act(async () => {
      expect(await result.current.signInWithCredentials(email, password)).toBe(
        'first-password-required',
      );
    });

    expect(navigateSpy).toHaveBeenCalledWith('/create-first-password');
    expect(mockLoadCurrentUser).not.toHaveBeenCalled();
    expect(mocks.getAuthTokensFromLoginToken.result).not.toHaveBeenCalled();
    expect(getDefaultStore().get(isCookieAuthActiveState.atom)).toBe(false);
  });

  it('should handle google sign-in', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        workspaceInviteHash: 'workspaceInviteHash',
        action: 'join-workspace',
      });
    });

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/auth/google?workspaceInviteHash=workspaceInviteHash',
      ),
    );
  });

  it('should forward returnToPath to /auth/google when set in state', async () => {
    getDefaultStore().set(
      returnToPathState.atom,
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.pathname).toBe('/auth/google');
    expect(parsed.searchParams.get('action')).toBe('list-available-workspaces');
    expect(parsed.searchParams.get('returnToPath')).toBe(
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );
  });

  it('should not forward an invalid (protocol-relative) returnToPath', async () => {
    getDefaultStore().set(returnToPathState.atom, '//evil.example.com');

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.searchParams.has('returnToPath')).toBe(false);
  });

  it('should handle sign-out', async () => {
    sessionStorage.setItem('lingering-key', 'should-be-cleared');
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-id',
      activationStatus: WorkspaceActivationStatus.SUSPENDED,
    } as CurrentWorkspace);
    getDefaultStore().set(currentUserState.atom, {
      id: 'user-id',
    } as CurrentUser);

    const { result } = renderHooks();

    await act(async () => {
      result.current.signOut();
    });

    expect(sessionStorage.length).toBe(0);
    expect(getDefaultStore().get(currentWorkspaceState.atom)).toBeNull();
    expect(getDefaultStore().get(currentUserState.atom)).toBeNull();
  });

  it('should handle credential sign-up', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signUpWithCredentialsInWorkspace({
        email,
        password,
      });
    });

    expect(mocks.signUpInWorkspace.result).toHaveBeenCalled();
  });
});
