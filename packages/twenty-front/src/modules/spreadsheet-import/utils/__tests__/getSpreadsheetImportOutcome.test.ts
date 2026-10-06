import {
  getSpreadsheetImportOutcome,
  getSpreadsheetImportSubmissionOutcome,
} from '@/spreadsheet-import/utils/getSpreadsheetImportOutcome';
import { type SpreadsheetImportSubmissionResult } from '@/spreadsheet-import/types';

const baseCounts = {
  total: 10,
  newRows: 0,
  exactMatches: 0,
  changedRows: 0,
  unresolvedDuplicateGroups: 0,
  conflicts: 0,
  invalidRows: 0,
  pendingPreflightRows: 0,
  hasPreflightFailure: false,
};

describe('getSpreadsheetImportOutcome', () => {
  it('prioritizes duplicate decisions over other row counts', () => {
    expect(
      getSpreadsheetImportOutcome({
        ...baseCounts,
        unresolvedDuplicateGroups: 2,
        invalidRows: 1,
      }),
    ).toBe('NEEDS_DUPLICATE_DECISIONS');
  });

  it('classifies a file of exact existing matches as nothing to import', () => {
    expect(
      getSpreadsheetImportOutcome({
        ...baseCounts,
        exactMatches: 10,
      }),
    ).toBe('NOTHING_TO_IMPORT');
  });

  it('distinguishes mixed new and exact-existing rows', () => {
    expect(
      getSpreadsheetImportOutcome({
        ...baseCounts,
        newRows: 2,
        exactMatches: 8,
      }),
    ).toBe('MIXED_READY');
  });

  it('prioritizes technical preflight failures and pending checks', () => {
    expect(
      getSpreadsheetImportOutcome({
        ...baseCounts,
        hasPreflightFailure: true,
        pendingPreflightRows: 1,
      }),
    ).toBe('PREFLIGHT_FAILED');
    expect(
      getSpreadsheetImportOutcome({ ...baseCounts, pendingPreflightRows: 1 }),
    ).toBe('CHECKING_RECORDS');
  });
});

describe('getSpreadsheetImportSubmissionOutcome', () => {
  const result: SpreadsheetImportSubmissionResult = {
    status: 'completed',
    created: 1,
    updated: 0,
    skippedExisting: 0,
    skippedPreserved: 0,
    skippedDuplicateRows: 0,
    skippedManually: 0,
    notImported: 0,
    failed: 0,
    totalRows: 1,
  };

  it('classifies success, partial success, failure, and the explicit no-op result', () => {
    expect(getSpreadsheetImportSubmissionOutcome(result)).toBe(
      'IMPORT_SUCCEEDED',
    );
    expect(
      getSpreadsheetImportSubmissionOutcome({ ...result, status: 'partial' }),
    ).toBe('IMPORT_PARTIALLY_SUCCEEDED');
    expect(
      getSpreadsheetImportSubmissionOutcome({ ...result, status: 'failed' }),
    ).toBe('IMPORT_FAILED');
    expect(
      getSpreadsheetImportSubmissionOutcome({
        ...result,
        outcome: 'NOTHING_TO_IMPORT',
      }),
    ).toBe('NOTHING_TO_IMPORT');
  });
});
