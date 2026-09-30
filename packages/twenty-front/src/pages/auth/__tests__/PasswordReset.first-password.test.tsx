import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PasswordReset } from '~/pages/auth/PasswordReset';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

const mockUpdatePasswordViaToken = jest.fn();
const mockNavigate = jest.fn();
const mockClearSession = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
let mockIsCaptchaReady = true;

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
    clearSession: mockClearSession,
  }),
}));
jest.mock('@/captcha/hooks/useReadCaptchaToken', () => ({
  useReadCaptchaToken: () => ({ readCaptchaToken: () => 'captcha-token' }),
}));
jest.mock('@/client-config/hooks/useCaptcha', () => ({
  useCaptcha: () => ({ isCaptchaReady: mockIsCaptchaReady }),
}));
jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
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
    mockIsCaptchaReady = true;
    mockUpdatePasswordViaToken.mockResolvedValue({
      data: { updatePasswordViaResetToken: { success: true } },
    });
  });

  it('submits confirmation and CAPTCHA, then routes to normal sign-in after reset succeeds', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider i18n={i18n}>
        <PasswordReset />
      </I18nProvider>,
    );

    await user.type(
      await screen.findByPlaceholderText('New Password'),
      'FreshPassword123',
    );
    await user.type(
      screen.getByPlaceholderText('Confirm New Password'),
      'FreshPassword123',
    );
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => expect(mockUpdatePasswordViaToken).toHaveBeenCalled());
    expect(mockUpdatePasswordViaToken).toHaveBeenCalledWith({
      variables: {
        token: 'reset-token',
        newPassword: 'FreshPassword123',
        captchaToken: 'captcha-token',
      },
    });
    expect(
      screen.getByText(
        'Your password has been updated. Sign in with your new password.',
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClearSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockUpdatePasswordViaToken).toHaveBeenCalledTimes(1);
  });

  it('does not submit when password confirmation does not match', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider i18n={i18n}>
        <PasswordReset />
      </I18nProvider>,
    );

    await user.type(
      await screen.findByPlaceholderText('New Password'),
      'FreshPassword123',
    );
    await user.type(
      screen.getByPlaceholderText('Confirm New Password'),
      'DifferentPassword123',
    );
    await user.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(
      await screen.findByText('Passwords do not match'),
    ).toBeInTheDocument();
    expect(mockUpdatePasswordViaToken).not.toHaveBeenCalled();
  });

  it('requires CAPTCHA readiness before reset submission', async () => {
    mockIsCaptchaReady = false;
    render(
      <I18nProvider i18n={i18n}>
        <PasswordReset />
      </I18nProvider>,
    );

    const submitButton = await screen.findByRole('button', {
      name: 'Change Password',
    });

    expect(submitButton).toBeDisabled();
    expect(mockUpdatePasswordViaToken).not.toHaveBeenCalled();
  });
});
