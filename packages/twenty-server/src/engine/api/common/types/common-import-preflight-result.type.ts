export type ImportPreflightStatus =
  'NEW' | 'EXACT_EXISTING_MATCH' | 'EXISTING_WITH_CHANGES' | 'CONFLICT';

export type CommonImportPreflightResult = {
  rowId: string;
  status: ImportPreflightStatus;
  existingRecordId?: string;
  matchedRecordIds: string[];
  matchedConstraintIds: string[];
  matchedConstraintNames: string[];
  changedFieldNames: string[];
  uncomparableFieldNames: string[];
  fieldDifferences: Array<{
    fieldMetadataId: string;
    fieldName: string;
    subFieldPath: string[];
    existingValue: unknown;
    incomingValue: unknown;
    sourceState: 'EMPTY' | 'VALUE';
    clearAllowed: boolean;
    comparable: boolean;
  }>;
};
