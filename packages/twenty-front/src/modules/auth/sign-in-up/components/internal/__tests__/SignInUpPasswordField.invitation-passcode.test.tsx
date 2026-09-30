import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';

import { SignInUpPasswordField } from '@/auth/sign-in-up/components/internal/SignInUpPasswordField';
import { type Form } from '@/auth/sign-in-up/hooks/useSignInUpForm';

jest.mock('@/ui/input/components/SettingsTextInput', () => ({
  SettingsTextInput: ({
    instanceId: _instanceId,
    fullWidth: _fullWidth,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    instanceId: string;
    onChange: (value: string) => void;
    fullWidth?: boolean;
  }) => (
    <input
      {...props}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

const TestField = () => {
  const form = useForm<Form>({
    defaultValues: { email: 'member@example.com', password: '' },
  });

  return (
    <I18nProvider i18n={i18n}>
      <FormProvider {...form}>
        <SignInUpPasswordField
          showErrors
          isCreatingPassword={false}
          isInvitationPasscode
        />
      </FormProvider>
    </I18nProvider>
  );
};

describe('SignInUpPasswordField invitation passcode', () => {
  it('uses a numeric one-time-code input and strips non-digits', () => {
    render(<TestField />);

    const input = screen.getByRole('textbox', { name: 'Invitation code' });

    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('maxlength', '6');

    fireEvent.change(input, { target: { value: '12a34567' } });

    expect(input).toHaveValue('123456');
  });
});
