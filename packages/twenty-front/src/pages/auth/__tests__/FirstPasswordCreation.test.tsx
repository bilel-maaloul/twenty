import { MockedProvider } from '@apollo/client/testing/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { CreateFirstPasswordDocument } from '~/generated-metadata/graphql';
import { FirstPasswordCreation } from '~/pages/auth/FirstPasswordCreation';

const navigateSpy = jest.fn();
const enqueueErrorSnackBar = jest.fn();
const enqueueSuccessSnackBar = jest.fn();
const mutationSpy = jest.fn();

i18n.activate('en');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateSpy,
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

const renderPage = (response: object | object[]) =>
  render(
    <MockedProvider
      mocks={(Array.isArray(response) ? response : [response]).map(
        (result) => ({
          request: {
            query: CreateFirstPasswordDocument,
            variables: {
              newPassword: 'FreshPassword123',
              confirmPassword: 'FreshPassword123',
            },
          },
          result: () => {
            mutationSpy();
            return result;
          },
        }),
      )}
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

const submitValidPassword = () => {
  fireEvent.change(screen.getByPlaceholderText('New Password'), {
    target: { value: 'FreshPassword123' },
  });
  fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
    target: { value: 'FreshPassword123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Password' }));
};

describe('FirstPasswordCreation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires matching passwords before calling the mutation', async () => {
    renderPage({ data: { createFirstPassword: true } });

    fireEvent.change(screen.getByPlaceholderText('New Password'), {
      target: { value: 'FreshPassword123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'DifferentPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Password' }));

    expect(await screen.findByText('Passwords do not match')).toBeTruthy();
    expect(mutationSpy).not.toHaveBeenCalled();
  });

  it('returns to sign-in after creation without establishing a session', async () => {
    renderPage({ data: { createFirstPassword: true } });
    submitValidPassword();

    await waitFor(() => expect(mutationSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/welcome', { replace: true }),
    );
    expect(enqueueSuccessSnackBar).toHaveBeenCalled();
  });

  it('keeps the page available after a correctable password rejection', async () => {
    renderPage({
      errors: [
        {
          message: 'Invalid input',
          extensions: { code: 'BAD_USER_INPUT', subCode: 'INVALID_INPUT' },
        },
      ],
    });
    submitValidPassword();

    await waitFor(() => expect(enqueueErrorSnackBar).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('New Password')).toBeTruthy();
  });

  it('allows another submission after INVALID_INPUT without signing in automatically', async () => {
    renderPage([
      {
        errors: [
          {
            message: 'Invalid input',
            extensions: { code: 'BAD_USER_INPUT', subCode: 'INVALID_INPUT' },
          },
        ],
      },
      { data: { createFirstPassword: true } },
    ]);

    submitValidPassword();
    await waitFor(() => expect(mutationSpy).toHaveBeenCalledTimes(1));
    expect(navigateSpy).not.toHaveBeenCalled();

    submitValidPassword();
    await waitFor(() => expect(mutationSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/welcome', { replace: true }),
    );
  });

  it('does not submit a password shorter than the existing policy', async () => {
    renderPage({ data: { createFirstPassword: true } });
    fireEvent.change(screen.getByPlaceholderText('New Password'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Password' }));

    expect(
      await screen.findByText('Password must be between 8 and 50 characters'),
    ).toBeTruthy();
    expect(mutationSpy).not.toHaveBeenCalled();
  });

  it('returns to sign-in for an invalid capability', async () => {
    renderPage({
      errors: [
        {
          message: 'Forbidden',
          extensions: { code: 'FORBIDDEN', subCode: 'FORBIDDEN_EXCEPTION' },
        },
      ],
    });
    submitValidPassword();

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/welcome', { replace: true }),
    );
  });

  it('does not retry an operational error', async () => {
    renderPage({ errors: [{ message: 'Internal error' }] });
    submitValidPassword();

    await waitFor(() => expect(mutationSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/welcome', { replace: true }),
    );
  });
});
