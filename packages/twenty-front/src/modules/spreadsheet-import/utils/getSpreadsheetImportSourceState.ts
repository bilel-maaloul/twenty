export type SpreadsheetImportSourceState = 'EMPTY' | 'VALUE';

export const getSpreadsheetImportSourceState = (
  value: unknown,
): SpreadsheetImportSourceState =>
  value === undefined || value === null || value === '' ? 'EMPTY' : 'VALUE';
