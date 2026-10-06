export type SpreadsheetImportPreflightStatus =
  | 'NEW'
  | 'EXACT_EXISTING_MATCH'
  | 'EXISTING_WITH_CHANGES'
  | 'CONFLICT'
  | 'PREFLIGHT_ERROR';

export type SpreadsheetImportPreflightAction =
  | 'CREATE'
  | 'SKIP_EXISTING'
  | 'SKIP_RECORD'
  | 'UPDATE_EXISTING'
  | 'BLOCKED';

export type SpreadsheetImportFieldDecision =
  | 'KEEP_EXISTING'
  | 'USE_INCOMING'
  | 'CLEAR'
  | 'IGNORE_INCOMING_FIELD'
  | 'ACCEPT_INCOMING_WARNING';

export type SpreadsheetImportFieldDifference = {
  fieldMetadataId: string;
  fieldName: string;
  subFieldPath: string[];
  existingValue: unknown;
  incomingValue: unknown;
  sourceState: 'EMPTY' | 'VALUE';
  clearAllowed: boolean;
  comparable: boolean;
};

export type SpreadsheetImportPreflightResult = {
  rowId: string;
  status: SpreadsheetImportPreflightStatus;
  existingRecordId?: string;
  matchedRecordIds: string[];
  matchedConstraintIds: string[];
  matchedConstraintNames: string[];
  changedFieldNames: string[];
  uncomparableFieldNames: string[];
  fieldDifferences: SpreadsheetImportFieldDifference[];
};
