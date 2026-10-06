import {
  getDefaultSpreadsheetImportFieldDecision,
  getDefaultSpreadsheetImportPreflightAction,
  shouldSubmitSpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { type SpreadsheetImportPreflightResult } from '@/spreadsheet-import/types';

const buildResult = (
  status: SpreadsheetImportPreflightResult['status'],
): SpreadsheetImportPreflightResult => ({
  rowId: 'row-1',
  status,
  matchedRecordIds: [],
  matchedConstraintIds: [],
  matchedConstraintNames: [],
  changedFieldNames: [],
  uncomparableFieldNames: [],
  fieldDifferences: [],
});

describe('spreadsheet import preflight actions', () => {
  it('defaults empty incoming fields to keep and populated differences to use incoming', () => {
    expect(
      getDefaultSpreadsheetImportFieldDecision({
        fieldMetadataId: 'field-id',
        fieldName: 'name',
        subFieldPath: [],
        existingValue: 'ABC',
        incomingValue: null,
        sourceState: 'EMPTY',
        clearAllowed: true,
        comparable: true,
      }),
    ).toBe('KEEP_EXISTING');
    expect(
      getDefaultSpreadsheetImportFieldDecision({
        fieldMetadataId: 'field-id',
        fieldName: 'name',
        subFieldPath: [],
        existingValue: 'ABC',
        incomingValue: 'XYZ',
        sourceState: 'VALUE',
        clearAllowed: true,
        comparable: true,
      }),
    ).toBe('USE_INCOMING');
  });

  it('creates new records and skips exact matches by default', () => {
    expect(getDefaultSpreadsheetImportPreflightAction(buildResult('NEW'))).toBe(
      'CREATE',
    );
    expect(
      getDefaultSpreadsheetImportPreflightAction(
        buildResult('EXACT_EXISTING_MATCH'),
      ),
    ).toBe('SKIP');
    expect(
      getDefaultSpreadsheetImportPreflightAction(
        buildResult('EXISTING_WITH_CHANGES'),
      ),
    ).toBe('UPDATE_EXISTING');
  });

  it('only submits new rows or explicitly selected updates', () => {
    expect(
      shouldSubmitSpreadsheetImportPreflightResult({
        result: buildResult('NEW'),
        action: 'CREATE',
      }),
    ).toBe(true);
    expect(
      shouldSubmitSpreadsheetImportPreflightResult({
        result: buildResult('EXISTING_WITH_CHANGES'),
        action: 'UPDATE_EXISTING',
      }),
    ).toBe(true);
    expect(
      shouldSubmitSpreadsheetImportPreflightResult({
        result: buildResult('EXACT_EXISTING_MATCH'),
        action: 'SKIP_EXISTING',
      }),
    ).toBe(false);
    expect(
      shouldSubmitSpreadsheetImportPreflightResult({
        result: buildResult('CONFLICT'),
        action: 'CREATE',
      }),
    ).toBe(false);
  });
});
