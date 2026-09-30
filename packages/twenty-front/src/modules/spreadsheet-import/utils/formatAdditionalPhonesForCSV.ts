import { getPhonePartsFromInternationalNumber } from '@/spreadsheet-import/utils/spreadsheetValueFormats';

export type SpreadsheetPhone = {
  number: string;
  callingCode: string;
  countryCode: string;
};

const isSpreadsheetPhone = (value: unknown): value is SpreadsheetPhone =>
  typeof value === 'object' &&
  value !== null &&
  'number' in value &&
  typeof value.number === 'string' &&
  'callingCode' in value &&
  typeof value.callingCode === 'string' &&
  'countryCode' in value &&
  typeof value.countryCode === 'string';

export const formatAdditionalPhonesForCSV = (phones: SpreadsheetPhone[]) =>
  phones
    .filter(({ number }) => number !== '')
    .map(({ number, callingCode, countryCode }) => {
      const internationalNumber = number.startsWith('+')
        ? number
        : `${callingCode}${number}`;

      return countryCode === ''
        ? internationalNumber
        : `${internationalNumber} (${countryCode})`;
    })
    .join('\n');

export const parseAdditionalPhonesFromCSV = (
  value: unknown,
): SpreadsheetPhone[] => {
  if (typeof value !== 'string') {
    throw new Error('Phone numbers must be text');
  }

  if (value.trim() === '') {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(value);

    if (Array.isArray(parsedValue) && parsedValue.every(isSpreadsheetPhone)) {
      return parsedValue;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return value.split(/\r?\n/).map((line) => {
    const match =
      line.match(/^(.+?)\s+\(([A-Z]{2})\)$/) ?? line.match(/^(.+)$/);

    if (!match) {
      throw new Error('Invalid phone number line');
    }

    const [, number, countryCode] = match;
    const phoneParts = getPhonePartsFromInternationalNumber(number.trim());

    if (
      countryCode !== undefined &&
      phoneParts.countryCode !== '' &&
      phoneParts.countryCode !== countryCode
    ) {
      throw new Error('Phone country code does not match its number');
    }

    return {
      ...phoneParts,
      countryCode: countryCode ?? phoneParts.countryCode,
    };
  });
};
