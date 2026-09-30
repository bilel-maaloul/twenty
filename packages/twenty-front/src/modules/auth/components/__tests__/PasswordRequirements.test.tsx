import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';

import { PasswordRequirements } from '@/auth/components/PasswordRequirements';

i18n.activate('en');

const renderRequirements = (password: string, confirmPassword?: string) =>
  render(
    <I18nProvider i18n={i18n}>
      <PasswordRequirements
        password={password}
        confirmPassword={confirmPassword}
      />
    </I18nProvider>,
  );

describe('PasswordRequirements', () => {
  it('shows each policy result and updates password matching state', () => {
    const { rerender } = renderRequirements('password1', 'different1');

    expect(
      screen.getByRole('listitem', { name: '8 to 50 characters: Satisfied' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', {
        name: 'At least one uppercase letter: Required',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'At least one number: Satisfied' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Passwords match: Required' }),
    ).toBeInTheDocument();

    rerender(
      <I18nProvider i18n={i18n}>
        <PasswordRequirements
          password="Password123"
          confirmPassword="Password123"
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole('listitem', {
        name: 'At least one uppercase letter: Satisfied',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: 'Passwords match: Satisfied' }),
    ).toBeInTheDocument();
  });

  it('omits password matching when there is no confirmation field', () => {
    renderRequirements('Password123');

    expect(
      screen.queryByRole('listitem', { name: /Passwords match/ }),
    ).not.toBeInTheDocument();
  });
});
