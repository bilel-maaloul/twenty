import {
  type SpreadsheetImportPreflightAction,
  type SpreadsheetImportFieldDecision,
  type SpreadsheetImportFieldDifference,
  type SpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/types';

export const getSpreadsheetImportFieldDifferenceKey = (
  difference: Pick<
    SpreadsheetImportFieldDifference,
    'fieldMetadataId' | 'subFieldPath'
  >,
) => `${difference.fieldMetadataId}:${difference.subFieldPath.join('.')}`;

export const getDefaultSpreadsheetImportFieldDecision = (
  difference: SpreadsheetImportFieldDifference,
): SpreadsheetImportFieldDecision =>
  difference.sourceState === 'EMPTY' ? 'KEEP_EXISTING' : 'USE_INCOMING';

export const getDefaultSpreadsheetImportPreflightAction = (
  result: SpreadsheetImportPreflightResult,
): SpreadsheetImportPreflightAction => {
  switch (result.status) {
    case 'NEW':
      return 'CREATE';
    case 'EXISTING_WITH_CHANGES':
      return 'UPDATE_EXISTING';
    case 'EXACT_EXISTING_MATCH':
      return 'SKIP_EXISTING';
    case 'CONFLICT':
    case 'PREFLIGHT_ERROR':
      return 'BLOCKED';
  }
};

export const shouldSubmitSpreadsheetImportPreflightResult = ({
  result,
  action,
}: {
  result: SpreadsheetImportPreflightResult | undefined;
  action: SpreadsheetImportPreflightAction | undefined;
}) =>
  (result?.status === 'NEW' && action === 'CREATE') ||
  (result?.status === 'EXISTING_WITH_CHANGES' &&
    result.uncomparableFieldNames.length === 0 &&
    action === 'UPDATE_EXISTING');
