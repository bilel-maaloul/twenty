import { parsePhoneNumberWithError } from 'libphonenumber-js';

const escapeListEntry = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');

const unescapeListEntry = (value: string) =>
  value.replace(/\\([\\rn])/g, (_, escapedCharacter: string) => {
    if (escapedCharacter === 'r') return '\r';
    if (escapedCharacter === 'n') return '\n';
    return escapedCharacter;
  });

export const formatStringArrayForCSV = (values: string[]) =>
  values.map(escapeListEntry).join('\n');

export const parseStringArrayFromCSV = (value: unknown): string[] => {
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
  ) {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error('List values must be text');
  }

  if (value.trim() === '') {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(value);

    if (
      Array.isArray(parsedValue) &&
      parsedValue.every((entry) => typeof entry === 'string')
    ) {
      return parsedValue;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return value.includes('\n')
    ? value
        .split(/\r?\n/)
        .filter((entry) => entry !== '')
        .map(unescapeListEntry)
    : value.split(',').map((entry) => entry.trim());
};

export const formatDateTimeForCSV = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const dateTime = date.toISOString();
  const milliseconds = dateTime.slice(20, 23);
  const fractionalSeconds = milliseconds === '000' ? '' : `.${milliseconds}`;

  return `${dateTime.slice(0, 10)} ${dateTime.slice(11, 19)}${fractionalSeconds} UTC`;
};

export const parseDateTimeFromCSV = (value: string) => {
  const utcDateTimeMatch = value.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?) UTC$/,
  );

  return utcDateTimeMatch !== null
    ? `${utcDateTimeMatch[1]}T${utcDateTimeMatch[2]}Z`
    : value;
};

export const getPhonePartsFromInternationalNumber = (value: string) => {
  const parsedPhoneNumber = parsePhoneNumberWithError(value);

  return {
    number: parsedPhoneNumber.number,
    callingCode: `+${parsedPhoneNumber.countryCallingCode}`,
    countryCode: parsedPhoneNumber.country ?? '',
  };
};
