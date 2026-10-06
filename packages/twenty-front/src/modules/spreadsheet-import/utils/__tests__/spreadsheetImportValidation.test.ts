import {
  getSpreadsheetImportValidationState,
  removeResolvedEmptyCellErrors,
  shouldRunSpreadsheetImportPreflight,
} from '@/spreadsheet-import/utils/spreadsheetImportValidation';
import { type SpreadsheetImportPreflightResult } from '@/spreadsheet-import/types';

const field = {
  key: 'shortName',
  fieldMetadataItemId: 'short-name-id',
  compositeSubFieldKey: undefined,
};

const emptyDifference: SpreadsheetImportPreflightResult['fieldDifferences'][number] =
  {
    fieldMetadataId: 'short-name-id',
    fieldName: 'nomCourt',
    subFieldPath: [],
    existingValue: 'ABC',
    incomingValue: null,
    sourceState: 'EMPTY',
    clearAllowed: true,
    comparable: true,
  };

const existingChange: SpreadsheetImportPreflightResult = {
  rowId: 'row-1',
  status: 'EXISTING_WITH_CHANGES',
  existingRecordId: 'record-1',
  matchedRecordIds: ['record-1'],
  matchedConstraintIds: [],
  matchedConstraintNames: [],
  changedFieldNames: ['nomCourt'],
  uncomparableFieldNames: [],
  fieldDifferences: [emptyDifference],
};

describe('spreadsheet import empty-cell validation', () => {
  it('allows preflight to inspect an empty required cell while preserving other errors', () => {
    expect(
      shouldRunSpreadsheetImportPreflight({
        __errors: {
          shortName: { level: 'error', message: 'Required' },
          email: { level: 'error', message: 'Invalid email' },
        },
        __sourceStates: JSON.stringify({ shortName: 'EMPTY', email: 'VALUE' }),
      }),
    ).toBe(true);

    expect(
      shouldRunSpreadsheetImportPreflight({
        __errors: { email: { level: 'error', message: 'Invalid email' } },
        __sourceStates: JSON.stringify({ email: 'VALUE' }),
      }),
    ).toBe(false);
  });

  it('clears only the empty-field validation error after a matching existing difference is found', () => {
    expect(
      removeResolvedEmptyCellErrors({
        errors: {
          shortName: { level: 'error', message: 'Required' },
          email: { level: 'error', message: 'Invalid email' },
        },
        sourceStates: { shortName: 'EMPTY', email: 'VALUE' },
        result: existingChange,
        fields: [field],
      }),
    ).toEqual({ email: { level: 'error', message: 'Invalid email' } });
  });

  it('does not clear the empty-field error when no existing difference was found', () => {
    expect(
      removeResolvedEmptyCellErrors({
        errors: { shortName: { level: 'error', message: 'Required' } },
        sourceStates: { shortName: 'EMPTY' },
        result: {
          ...existingChange,
          status: 'EXACT_EXISTING_MATCH',
          fieldDifferences: [],
        },
        fields: [field],
      }),
    ).toEqual({ shortName: { level: 'error', message: 'Required' } });
  });
});

describe('spreadsheet import invalid-value decisions', () => {
  const optionalField = {
    key: 'domainName (Link URL)',
    canIgnoreIncomingValue: true,
    fieldValidationDefinitions: [
      {
        rule: 'function',
        canAcceptInvalidValue: () => false,
      },
    ],
  };
  const row = {
    [optionalField.key]: 'invalid_domain.com',
    __errors: {
      [optionalField.key]: {
        level: 'error' as const,
        message: 'Invalid URL',
      },
    },
    __sourceStates: JSON.stringify({ [optionalField.key]: 'VALUE' }),
  };

  it('requires an explicit decision for an optional invalid field', () => {
    expect(
      getSpreadsheetImportValidationState(row, [optionalField]).blockingErrors,
    ).toHaveLength(1);
    expect(shouldRunSpreadsheetImportPreflight(row, [optionalField])).toBe(
      false,
    );
  });

  it('allows an optional invalid field to be ignored before preflight', () => {
    const resolvedRow = {
      ...row,
      __fieldDecisions: JSON.stringify({
        [optionalField.key]: 'IGNORE_INCOMING_FIELD',
      }),
    };

    expect(
      getSpreadsheetImportValidationState(resolvedRow, [optionalField]),
    ).toMatchObject({
      blockingErrors: [],
      ignoredErrors: [{ field: optionalField }],
    });
    expect(
      shouldRunSpreadsheetImportPreflight(resolvedRow, [optionalField]),
    ).toBe(true);
  });

  it('does not allow required invalid values to be ignored', () => {
    const requiredField = { ...optionalField, canIgnoreIncomingValue: false };
    const resolvedRow = {
      ...row,
      __fieldDecisions: JSON.stringify({
        [optionalField.key]: 'IGNORE_INCOMING_FIELD',
      }),
    };

    expect(
      getSpreadsheetImportValidationState(resolvedRow, [requiredField])
        .blockingErrors,
    ).toHaveLength(1);
    expect(
      shouldRunSpreadsheetImportPreflight(resolvedRow, [requiredField]),
    ).toBe(false);
  });

  it('keeps each invalid field blocking until that field has its own decision', () => {
    const secondField = { ...optionalField, key: 'phone' };
    const multipleErrorRow = {
      ...row,
      phone: 'not-a-phone',
      __errors: {
        ...row.__errors,
        phone: { level: 'error' as const, message: 'Invalid phone' },
      },
      __fieldDecisions: JSON.stringify({
        [optionalField.key]: 'IGNORE_INCOMING_FIELD',
      }),
    };

    expect(
      getSpreadsheetImportValidationState(multipleErrorRow, [
        optionalField,
        secondField,
      ]).blockingErrors.map(({ fieldKey }) => fieldKey),
    ).toEqual(['phone']);
  });

  it('accepts an invalid value only when the validator explicitly marks it backend-safe', () => {
    const safeField = {
      ...optionalField,
      fieldValidationDefinitions: [
        {
          rule: 'function',
          canAcceptInvalidValue: (value: string) => value.startsWith('legacy:'),
        },
      ],
    };
    const safeRow = {
      ...row,
      [optionalField.key]: 'legacy:value',
      __fieldDecisions: JSON.stringify({
        [optionalField.key]: 'ACCEPT_INCOMING_WARNING',
      }),
    };
    const unsafeRow = {
      ...safeRow,
      [optionalField.key]: 'invalid_domain.com',
    };

    expect(
      getSpreadsheetImportValidationState(safeRow, [safeField]).blockingErrors,
    ).toHaveLength(0);
    expect(
      getSpreadsheetImportValidationState(unsafeRow, [safeField])
        .blockingErrors,
    ).toHaveLength(1);
  });
});
