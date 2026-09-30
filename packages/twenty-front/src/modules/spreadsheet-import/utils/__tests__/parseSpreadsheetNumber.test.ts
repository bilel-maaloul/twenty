import { parseSpreadsheetNumber } from '@/spreadsheet-import/utils/parseSpreadsheetNumber';

describe('parseSpreadsheetNumber', () => {
  it.each([
    ['1234', 1234],
    ['-1234.56', -1234.56],
    ['1234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['1\u00a0234,56', 1234.56],
    ["1'234.56", 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1,234,567', 1234567],
    ['.5', 0.5],
    ['1e3', 1000],
  ])('parses the unambiguous number %s', (value, expected) => {
    expect(parseSpreadsheetNumber(value)).toBe(expected);
  });

  it.each(['1,234', '1.234', '', 'Infinity', 'not a number', '1,23,4'])(
    'rejects an invalid or ambiguous number %s',
    (value) => {
      expect(parseSpreadsheetNumber(value)).toBeUndefined();
    },
  );

  it('accepts finite numeric cells and rejects non-finite values', () => {
    expect(parseSpreadsheetNumber(123.45)).toBe(123.45);
    expect(parseSpreadsheetNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
