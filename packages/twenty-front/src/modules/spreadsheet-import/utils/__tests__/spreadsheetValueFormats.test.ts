import {
  formatDateTimeForCSV,
  parseDateTimeFromCSV,
  parseStringArrayFromCSV,
} from '@/spreadsheet-import/utils/spreadsheetValueFormats';

describe('spreadsheetValueFormats', () => {
  it('round trips readable line-separated lists and legacy JSON arrays', () => {
    expect(parseStringArrayFromCSV('first\nsecond')).toEqual([
      'first',
      'second',
    ]);
    expect(parseStringArrayFromCSV('["first","second"]')).toEqual([
      'first',
      'second',
    ]);
    expect(
      parseStringArrayFromCSV('line one\\ncontinued\nsecond\\\\entry'),
    ).toEqual(['line one\ncontinued', 'second\\entry']);
  });

  it('formats timestamps for Excel while preserving UTC on import', () => {
    const formatted = formatDateTimeForCSV('2025-02-03T04:05:06.123Z');

    expect(formatted).toBe('2025-02-03 04:05:06.123 UTC');
    expect(new Date(parseDateTimeFromCSV(formatted)).toISOString()).toBe(
      '2025-02-03T04:05:06.123Z',
    );
  });

  it('omits fractional seconds when they are zero', () => {
    expect(formatDateTimeForCSV('2025-02-03T04:05:06.000Z')).toBe(
      '2025-02-03 04:05:06 UTC',
    );
  });
});
