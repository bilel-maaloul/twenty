import { render, screen } from '@testing-library/react';

import { TextInput } from '@/ui/input/components/TextInput';

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

describe('TextInput input mode forwarding', () => {
  it('forwards numeric input mode and the accessible label to the input', () => {
    render(
      <TextInput
        aria-label="Invitation code"
        inputMode="numeric"
        value=""
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Invitation code' }),
    ).toHaveAttribute('inputmode', 'numeric');
  });
});
