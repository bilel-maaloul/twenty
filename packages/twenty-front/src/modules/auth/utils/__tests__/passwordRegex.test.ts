import {
  PASSWORD_LENGTH_REGEX,
  PASSWORD_REGEX,
} from '@/auth/utils/passwordRegex';

describe('PASSWORD_REGEX', () => {
  it('requires at least 8 characters, an uppercase letter, and a number', () => {
    expect(PASSWORD_REGEX.test('Password123')).toBe(true);
    expect(PASSWORD_REGEX.test('short1A')).toBe(false);
    expect(PASSWORD_REGEX.test('password123')).toBe(false);
    expect(PASSWORD_REGEX.test('PasswordOnly')).toBe(false);
  });

  it('preserves the existing 50 character maximum', () => {
    expect(PASSWORD_REGEX.test(`A1${'a'.repeat(48)}`)).toBe(true);
    expect(PASSWORD_REGEX.test(`A1${'a'.repeat(49)}`)).toBe(false);
  });

  it('keeps ordinary login validation limited to the existing length rule', () => {
    expect(PASSWORD_LENGTH_REGEX.test('password123')).toBe(true);
    expect(PASSWORD_LENGTH_REGEX.test('1234567')).toBe(false);
  });
});
