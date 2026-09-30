import {
  formatAdditionalPhonesForCSV,
  parseAdditionalPhonesFromCSV,
} from '@/spreadsheet-import/utils/formatAdditionalPhonesForCSV';

describe('additional phone CSV values', () => {
  it('writes international numbers as readable lines and parses them back', () => {
    const formatted = formatAdditionalPhonesForCSV([
      {
        number: '+1 416 555 0100',
        callingCode: '+1',
        countryCode: 'CA',
      },
    ]);

    expect(formatted).toBe('+1 416 555 0100 (CA)');
    expect(parseAdditionalPhonesFromCSV(formatted)).toEqual([
      {
        number: '+14165550100',
        callingCode: '+1',
        countryCode: 'CA',
      },
    ]);
  });

  it('continues to parse phone arrays from existing CSV exports', () => {
    expect(
      parseAdditionalPhonesFromCSV(
        '[{"number":"+14165550100","callingCode":"+1","countryCode":"CA"}]',
      ),
    ).toEqual([
      {
        number: '+14165550100',
        callingCode: '+1',
        countryCode: 'CA',
      },
    ]);
  });

  it('rejects local phone numbers without an international calling code', () => {
    expect(() => parseAdditionalPhonesFromCSV('416-555-0100')).toThrow();
  });
});
