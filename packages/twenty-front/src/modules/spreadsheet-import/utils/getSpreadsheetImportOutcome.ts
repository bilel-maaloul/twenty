import { type SpreadsheetImportSubmissionResult } from '@/spreadsheet-import/types';

export type SpreadsheetImportOutcomeCounts = {
  total: number;
  newRows: number;
  exactMatches: number;
  changedRows: number;
  unresolvedDuplicateGroups: number;
  conflicts: number;
  invalidRows: number;
  pendingPreflightRows: number;
  hasPreflightFailure: boolean;
};

export type SpreadsheetImportOutcome =
  | 'PREFLIGHT_FAILED'
  | 'CHECKING_RECORDS'
  | 'NEEDS_DUPLICATE_DECISIONS'
  | 'HAS_CONFLICTS'
  | 'NEEDS_INVALID_DATA_DECISIONS'
  | 'NEEDS_CHANGE_REVIEW'
  | 'NOTHING_TO_IMPORT'
  | 'MIXED_READY'
  | 'READY_TO_IMPORT'
  | 'IMPORT_SUCCEEDED'
  | 'IMPORT_PARTIALLY_SUCCEEDED'
  | 'IMPORT_FAILED';

export const getSpreadsheetImportOutcome = (
  counts: SpreadsheetImportOutcomeCounts,
): SpreadsheetImportOutcome => {
  if (counts.hasPreflightFailure) {
    return 'PREFLIGHT_FAILED';
  }

  if (counts.unresolvedDuplicateGroups > 0) {
    return 'NEEDS_DUPLICATE_DECISIONS';
  }

  if (counts.conflicts > 0) {
    return 'HAS_CONFLICTS';
  }

  if (counts.invalidRows > 0) {
    return 'NEEDS_INVALID_DATA_DECISIONS';
  }

  if (counts.pendingPreflightRows > 0) {
    return 'CHECKING_RECORDS';
  }

  if (counts.changedRows > 0) {
    return 'NEEDS_CHANGE_REVIEW';
  }

  if (counts.total > 0 && counts.exactMatches === counts.total) {
    return 'NOTHING_TO_IMPORT';
  }

  if (counts.exactMatches > 0 && counts.newRows > 0) {
    return 'MIXED_READY';
  }

  return 'READY_TO_IMPORT';
};

export const getSpreadsheetImportSubmissionOutcome = (
  result: SpreadsheetImportSubmissionResult,
): SpreadsheetImportOutcome => {
  if (result.outcome === 'NOTHING_TO_IMPORT') {
    return 'NOTHING_TO_IMPORT';
  }

  if (result.status === 'failed') {
    return 'IMPORT_FAILED';
  }

  if (result.status === 'partial') {
    return 'IMPORT_PARTIALLY_SUCCEEDED';
  }

  return 'IMPORT_SUCCEEDED';
};
