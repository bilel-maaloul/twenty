import { getSpreadsheetImportSourceState } from '@/spreadsheet-import/utils/getSpreadsheetImportSourceState';

describe('getSpreadsheetImportSourceState', () => {
  it.each([undefined, null, ''])('classifies %p as EMPTY', (value) => {
    expect(getSpreadsheetImportSourceState(value)).toBe('EMPTY');
  });

  it.each([false, true, 'false', 0, '0'])('classifies %p as VALUE', (value) => {
    expect(getSpreadsheetImportSourceState(value)).toBe('VALUE');
  });
});
