export type SpreadsheetImportSubmissionResult = {
  status: 'completed' | 'partial' | 'failed';
  outcome?: 'NOTHING_TO_IMPORT';
  created: number;
  updated: number;
  skippedExisting: number;
  skippedPreserved: number;
  skippedDuplicateRows: number;
  skippedDuplicateRowNumbers?: number[];
  skippedManually: number;
  skippedManuallyRowNumbers?: number[];
  notImported: number;
  failed: number;
  totalRows: number;
  errorMessage?: string;
  preservationMessages?: string[];
  ignoredFieldValues?: Array<{
    rowNumber: number;
    recordLabel?: string;
    fieldLabel: string;
    incomingValue: string;
    reason: string;
  }>;
  rowIssues?: Array<{ rowNumber: number; message: string }>;
};
