import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';

import { EmailVerificationSent } from '@/auth/sign-in-up/components/EmailVerificationSent';

const mockResend = jest.fn();

i18n.activate('en');

jest.mock(
  '@/auth/sign-in-up/hooks/useHandleResendEmailVerificationToken',
  () => ({
    useHandleResendEmailVerificationToken: () => ({
      handleResendEmailVerificationToken: (email: string) => () =>
        mockResend(email),
      loading: false,
    }),
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomState', () => ({
  useSetAtomState: () => jest.fn(),
}));
jest.mock('@/onboarding/components/OnboardingModalCircularIcon', () => ({
  OnboardingModalCircularIcon: () => null,
}));
jest.mock('@/auth/components/Title', () => ({
  Title: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
jest.mock('@/auth/components/SubTitle', () => ({
  SubTitle: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
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

describe('EmailVerificationSent for provisioned users', () => {
  it('offers resend without claiming a verification email was already sent', () => {
    render(
      <I18nProvider i18n={i18n}>
        <EmailVerificationSent email="member@example.com" />
      </I18nProvider>,
    );

    expect(screen.getByText(/Verify the email address for/)).toBeTruthy();
    expect(screen.queryByText(/has been sent/)).toBeNull();
    fireEvent.click(screen.getAllByText('Resend email')[0]);
    expect(mockResend).toHaveBeenCalledWith('member@example.com');
  });
});
