import { type SpreadsheetImportPreflightResult } from '@/spreadsheet-import/types';
import { type SpreadsheetImportInfo } from '@/spreadsheet-import/types';
import { type SpreadsheetImportFieldDecision } from '@/spreadsheet-import/types';

export type SpreadsheetImportValidationField = {
  key: string;
  fieldMetadataItemId?: string;
  compositeSubFieldKey?: string;
  canIgnoreIncomingValue?: boolean;
  fieldValidationDefinitions?: ReadonlyArray<{
    rule: string;
    canAcceptInvalidValue?: (value: string) => boolean;
  }>;
};

type SpreadsheetImportValidationRow = {
  [fieldKey: string]: unknown;
  __errors?: Record<string, SpreadsheetImportInfo> | null;
  __fieldDecisions?: string;
  __sourceStates?: string;
};

const getFieldDecisions = (row: SpreadsheetImportValidationRow) => {
  try {
    return JSON.parse(row.__fieldDecisions ?? '{}') as Record<
      string,
      SpreadsheetImportFieldDecision
    >;
  } catch {
    return {};
  }
};

const canAcceptIncomingValue = (
  row: SpreadsheetImportValidationRow,
  field: SpreadsheetImportValidationField,
) => {
  const rawValue = row[field.key];
  const value =
    typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');

  return field.fieldValidationDefinitions?.some(
    (definition) =>
      definition.rule === 'function' &&
      definition.canAcceptInvalidValue?.(value) === true,
  );
};

export const getSpreadsheetImportValidationState = (
  row: SpreadsheetImportValidationRow,
  fields: ReadonlyArray<SpreadsheetImportValidationField>,
) => {
  const decisions = getFieldDecisions(row);
  const blockingErrors: Array<{
    fieldKey: string;
    error: SpreadsheetImportInfo;
  }> = [];
  const ignoredErrors: Array<{
    field: SpreadsheetImportValidationField;
    error: SpreadsheetImportInfo;
  }> = [];
  const acceptedErrors: Array<{
    field: SpreadsheetImportValidationField;
    error: SpreadsheetImportInfo;
  }> = [];

  Object.entries(row.__errors ?? {}).forEach(([fieldKey, error]) => {
    if (error.level !== 'error') {
      return;
    }

    const field = fields.find(({ key }) => key === fieldKey);
    const decision = decisions[fieldKey];

    if (
      field &&
      decision === 'IGNORE_INCOMING_FIELD' &&
      field.canIgnoreIncomingValue === true
    ) {
      ignoredErrors.push({ field, error });
      return;
    }

    if (
      field &&
      decision === 'ACCEPT_INCOMING_WARNING' &&
      canAcceptIncomingValue(row, field)
    ) {
      acceptedErrors.push({ field, error });
      return;
    }

    blockingErrors.push({ fieldKey, error });
  });

  return { blockingErrors, ignoredErrors, acceptedErrors };
};

type SpreadsheetImportRow = {
  [fieldKey: string]: unknown;
  __preflightAction?: string;
  __errors?: Record<string, SpreadsheetImportInfo> | null;
  __sourceStates?: string;
};

export const shouldRunSpreadsheetImportPreflight = (
  row: SpreadsheetImportRow,
  fields: ReadonlyArray<SpreadsheetImportValidationField> = [],
) => {
  if (row.__preflightAction === 'SKIP_RECORD') {
    return false;
  }

  const { blockingErrors } = getSpreadsheetImportValidationState(row, fields);

  if (blockingErrors.length === 0) {
    return true;
  }

  const sourceStates = JSON.parse(
    typeof row.__sourceStates === 'string' ? row.__sourceStates : '{}',
  ) as Record<string, 'EMPTY' | 'VALUE'>;

  return blockingErrors.some(
    ({ fieldKey }) => sourceStates[fieldKey] === 'EMPTY',
  );
};

export const removeResolvedEmptyCellErrors = ({
  errors,
  sourceStates,
  result,
  fields,
}: {
  errors: Record<string, SpreadsheetImportInfo>;
  sourceStates: Record<string, 'EMPTY' | 'VALUE'>;
  result: SpreadsheetImportPreflightResult;
  fields: ReadonlyArray<SpreadsheetImportValidationField>;
}) => {
  const nextErrors = { ...errors };

  if (result.status !== 'EXISTING_WITH_CHANGES') {
    return nextErrors;
  }

  for (const field of fields) {
    if (sourceStates[field.key] !== 'EMPTY') {
      continue;
    }

    const hasExistingValueDifference = result.fieldDifferences.some(
      (difference) =>
        difference.fieldMetadataId === field.fieldMetadataItemId &&
        difference.subFieldPath[0] === field.compositeSubFieldKey &&
        difference.sourceState === 'EMPTY',
    );

    if (hasExistingValueDifference) {
      delete nextErrors[field.key];
    }
  }

  return nextErrors;
};
