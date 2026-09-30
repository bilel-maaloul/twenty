import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { useAuth } from '@/auth/hooks/useAuth';
import { useCaptcha } from '@/client-config/hooks/useCaptcha';
import { useReadCaptchaToken } from '@/captcha/hooks/useReadCaptchaToken';
import { useRequestFreshCaptchaToken } from '@/captcha/hooks/useRequestFreshCaptchaToken';
import { CreateFirstPasswordDocument } from '~/generated-metadata/graphql';
import { HasFirstPasswordCreationCapabilityDocument } from '~/generated-metadata/graphql';
import { FirstPasswordCreation } from '~/pages/auth/FirstPasswordCreation';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

const navigateSpy = jest.fn();
const enqueueErrorSnackBar = jest.fn();
const enqueueSuccessSnackBar = jest.fn();
const completeFirstPasswordSignIn = jest.fn();
const requestFreshCaptchaToken = jest.fn();
const readCaptchaToken = jest.fn(() => 'captcha-token');
const createPasswordSpy = jest.fn();

i18n.activate('en');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateSpy,
}));

jest.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({ completeFirstPasswordSignIn }),
}));

jest.mock('@/client-config/hooks/useCaptcha', () => ({
  useCaptcha: jest.fn(() => ({ isCaptchaReady: true })),
}));

jest.mock('@/captcha/hooks/useReadCaptchaToken', () => ({
  useReadCaptchaToken: () => ({ readCaptchaToken }),
}));

jest.mock('@/captcha/hooks/useRequestFreshCaptchaToken', () => ({
  useRequestFreshCaptchaToken: () => ({ requestFreshCaptchaToken }),
}));

jest.mock('@/captcha/components/CaptchaCheckbox', () => ({
  CaptchaCheckbox: () => <div role="group" aria-label="I'm not a robot" />,
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar, enqueueSuccessSnackBar }),
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
    onChange: (value: string) => void;
    error?: string;
    fullWidth?: boolean;
  }) => (
    <>
      <input {...props} onChange={(event) => onChange(event.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

const capabilityMock = (hasCapability: boolean) => ({
  request: { query: HasFirstPasswordCreationCapabilityDocument },
  result: { data: { hasFirstPasswordCreationCapability: hasCapability } },
});

const renderPage = (
  hasCapability: boolean,
  additionalMocks: Array<Record<string, unknown>> = [],
) =>
  render(
    <MockedProvider
      mocks={[capabilityMock(hasCapability), ...additionalMocks] as never}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[AppPath.CreateFirstPassword]}>
          <Routes>
            <Route
              path={AppPath.CreateFirstPassword}
              element={<FirstPasswordCreation />}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </MockedProvider>,
  );

const submitValidPassword = async () => {
  fireEvent.change(await screen.findByPlaceholderText('New Password'), {
    target: { value: 'FreshPassword123' },
  });
  fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
    target: { value: 'FreshPassword123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Password' }));
};

const createPasswordMock = (result: Record<string, unknown>) => ({
  request: {
    query: CreateFirstPasswordDocument,
    variables: {
      newPassword: 'FreshPassword123',
      confirmPassword: 'FreshPassword123',
      captchaToken: 'captcha-token',
    },
  },
  result: () => {
    createPasswordSpy();
    return result;
  },
});

describe('FirstPasswordCreation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useCaptcha).mockReturnValue({ isCaptchaReady: true } as never);
  });

  it('redirects to normal sign-in when there is no restricted capability', async () => {
    renderPage(false);

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith(AppPath.SignInUp, {
        replace: true,
      }),
    );
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText("I'm not a robot")).not.toBeInTheDocument();
  });

  it('requires matching passwords before calling the password mutation', async () => {
    renderPage(true);

    fireEvent.change(await screen.findByPlaceholderText('New Password'), {
      target: { value: 'FreshPassword123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'DifferentPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Password' }));

    expect(await screen.findByText('Passwords do not match')).toBeTruthy();
    expect(createPasswordSpy).not.toHaveBeenCalled();
  });

  it('submits the CAPTCHA token and establishes the normal CRM session directly', async () => {
    renderPage(true, [
      createPasswordMock({
        data: {
          createFirstPassword: {
            tokens: {
              accessOrWorkspaceAgnosticToken: { token: 'access' },
              refreshToken: { token: 'refresh' },
            },
          },
        },
      }),
    ]);
    await submitValidPassword();

    await waitFor(() => expect(createPasswordSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(completeFirstPasswordSignIn).toHaveBeenCalledTimes(1),
    );
    expect(enqueueSuccessSnackBar).toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not submit permanent password without a ready CAPTCHA', async () => {
    jest.mocked(useCaptcha).mockReturnValue({ isCaptchaReady: false } as never);
    renderPage(true);
    await submitValidPassword();

    expect(
      await screen.findByRole('button', { name: 'Create Password' }),
    ).toBeDisabled();
    expect(createPasswordSpy).not.toHaveBeenCalled();
  });

  it('keeps the restricted page available after a correctable password rejection', async () => {
    renderPage(true, [
      createPasswordMock({
        errors: [
          {
            message: 'Invalid input',
            extensions: { code: 'BAD_USER_INPUT', subCode: 'INVALID_INPUT' },
          },
        ],
      }),
    ]);
    await submitValidPassword();

    await waitFor(() => expect(enqueueErrorSnackBar).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('New Password')).toBeInTheDocument();
  });

  it('refreshes CAPTCHA and keeps the restricted page after CAPTCHA rejection', async () => {
    renderPage(true, [
      createPasswordMock({
        errors: [
          {
            message: 'Invalid CAPTCHA',
            extensions: { code: 'BAD_USER_INPUT', subCode: 'INVALID_CAPTCHA' },
          },
        ],
      }),
    ]);
    await submitValidPassword();

    await waitFor(() => expect(requestFreshCaptchaToken).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('New Password')).toBeInTheDocument();
  });

  it('returns to sign-in after the restricted capability is invalid', async () => {
    renderPage(true, [
      createPasswordMock({
        errors: [
          {
            message: 'Forbidden',
            extensions: { code: 'FORBIDDEN', subCode: 'FORBIDDEN_EXCEPTION' },
          },
        ],
      }),
    ]);
    submitValidPassword();

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith(AppPath.SignInUp, {
        replace: true,
      }),
    );
    expect(completeFirstPasswordSignIn).not.toHaveBeenCalled();
  });
});
