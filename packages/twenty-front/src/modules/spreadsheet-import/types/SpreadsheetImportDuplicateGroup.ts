export type SpreadsheetImportDuplicateGroup = {
  id: string;
  kind: 'unique-constraint' | 'exact-row';
  fields: { label: string; value: string }[];
  rows: { rowNumber: number; label?: string }[];
};

export type SpreadsheetImportDuplicateResolution =
  { kind: 'KEEP_ONE'; rowNumber: number } | { kind: 'SKIP_ALL' };

export type SpreadsheetImportDuplicateResolutionStatus =
  'UNRESOLVED' | 'INCONSISTENT' | 'KEEP_ONE' | 'SKIP';
