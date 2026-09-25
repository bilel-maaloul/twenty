import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PasswordReset } from '~/pages/auth/PasswordReset';

const mockSignInInWorkspace = jest.fn();
const mockSignInGlobal = jest.fn();
const mockUpdatePasswordViaToken = jest.fn();
const mockRedirect = jest.fn();
const mockNavigate = jest.fn();

i18n.activate('en');

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useQuery: () => ({
    data: {
      validatePasswordResetToken: {
        email: 'member@example.com',
        hasPassword: true,
      },
    },
    error: undefined,
  }),
  useMutation: () => [mockUpdatePasswordViaToken, { loading: false }],
}));

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    signInWithCredentialsInWorkspace: mockSignInInWorkspace,
    signInWithCredentials: mockSignInGlobal,
  }),
}));
jest.mock('@/auth/hooks/useIsLogged', () => ({ useIsLogged: () => false }));
jest.mock('@/captcha/hooks/useReadCaptchaToken', () => ({
  useReadCaptchaToken: () => ({ readCaptchaToken: () => 'captcha-token' }),
}));
jest.mock('@/client-config/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ isCaptchaReady: true }),
}));
jest.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({ isOnAWorkspace: true }),
}));
jest.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: () => ({ redirect: mockRedirect }),
}));
jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => null,
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: () => jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ passwordResetToken: 'reset-token' }),
}));
jest.mock('@/auth/components/Logo', () => ({ Logo: () => null }));
jest.mock('@/auth/components/Title', () => ({
  Title: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
jest.mock('@/auth/components/StyledOnboardingContentContainer', () => ({
  StyledOnboardingContentContainer: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div>{children}</div>,
}));
jest.mock('twenty-ui/surfaces', () => ({
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('twenty-ui/layout', () => ({
  AnimatedEaseIn: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('twenty-ui/input', () => ({
  MainButton: ({
    title,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) => (
    <button {...props}>{title}</button>
  ),
}));
jest.mock('@/ui/input/components/TextInput', () => ({
  TextInput: ({
    onChange,
    error,
    fullWidth: _fullWidth,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    onChange?: (value: string) => void;
    error?: string;
    fullWidth?: boolean;
  }) => (
    <>
      <input {...props} onChange={(event) => onChange?.(event.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

describe('PasswordReset first-password outcome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePasswordViaToken.mockResolvedValue({
      data: { updatePasswordViaResetToken: { success: true } },
    });
  });

  it('does not redirect into the CRM after a restricted workspace sign-in', async () => {
    mockSignInInWorkspace.mockResolvedValue('first-password-required');
    render(
      <I18nProvider i18n={i18n}>
        <PasswordReset />
      </I18nProvider>,
    );

    fireEvent.change(await screen.findByPlaceholderText('New Password'), {
      target: { value: 'FreshPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(mockSignInInWorkspace).toHaveBeenCalled());
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
