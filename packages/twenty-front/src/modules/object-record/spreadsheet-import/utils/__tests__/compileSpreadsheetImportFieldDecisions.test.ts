import {
  compileSpreadsheetImportFieldDecisions,
  hasEffectiveSpreadsheetImportUpdate,
} from '@/object-record/spreadsheet-import/utils/compileSpreadsheetImportFieldDecisions';
import { getSpreadsheetImportFieldDifferenceKey } from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { type SpreadsheetImportPreflightResult } from '@/spreadsheet-import/types';

const difference: SpreadsheetImportPreflightResult['fieldDifferences'][number] =
  {
    fieldMetadataId: 'field-id',
    fieldName: 'name',
    subFieldPath: [],
    existingValue: 'ABC',
    incomingValue: null,
    sourceState: 'EMPTY',
    clearAllowed: true,
    comparable: true,
  };

const preflight: SpreadsheetImportPreflightResult = {
  rowId: 'row-1',
  status: 'EXISTING_WITH_CHANGES',
  existingRecordId: 'record-1',
  matchedRecordIds: ['record-1'],
  matchedConstraintIds: [],
  matchedConstraintNames: [],
  changedFieldNames: ['name'],
  uncomparableFieldNames: [],
  fieldDifferences: [difference],
};

describe('compileSpreadsheetImportFieldDecisions', () => {
  const differenceKey = getSpreadsheetImportFieldDifferenceKey(difference);

  it('omits a field when the user keeps the existing value', () => {
    const compiledRecord = compileSpreadsheetImportFieldDecisions({
      recordInput: { name: 'incoming', other: 'value' },
      preflight,
      action: 'UPDATE_EXISTING',
      decisions: { [differenceKey]: 'KEEP_EXISTING' },
    });

    expect(compiledRecord).toEqual({ id: 'record-1' });
    expect(hasEffectiveSpreadsheetImportUpdate(compiledRecord)).toBe(false);
  });

  it('retains the incoming value when the user accepts it', () => {
    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: { name: 'incoming' },
        preflight,
        action: 'UPDATE_EXISTING',
        decisions: { [differenceKey]: 'USE_INCOMING' },
      }),
    ).toEqual({ id: 'record-1', name: 'incoming' });
  });

  it('encodes an explicit clear as null only when the server marked it allowed', () => {
    const explicitlyCleared = compileSpreadsheetImportFieldDecisions({
      recordInput: {},
      preflight,
      action: 'UPDATE_EXISTING',
      decisions: { [differenceKey]: 'CLEAR' },
    });

    expect(explicitlyCleared).toEqual({ id: 'record-1', name: null });
    expect(hasEffectiveSpreadsheetImportUpdate(explicitlyCleared)).toBe(true);

    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: { name: 'incoming' },
        preflight: {
          ...preflight,
          fieldDifferences: [{ ...difference, clearAllowed: false }],
        },
        action: 'UPDATE_EXISTING',
        decisions: { [differenceKey]: 'CLEAR' },
      }),
    ).toEqual({ id: 'record-1' });
  });

  it('fails closed if an existing-row update has no matched record identity', () => {
    expect(() =>
      compileSpreadsheetImportFieldDecisions({
        recordInput: { name: 'incoming' },
        preflight: { ...preflight, existingRecordId: undefined },
        action: 'UPDATE_EXISTING',
        decisions: { [differenceKey]: 'USE_INCOMING' },
      }),
    ).toThrow('Cannot build an update without a matched record ID.');
  });

  it('omits a kept compound subfield without removing its sibling patch', () => {
    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: {
          emails: { primaryEmail: 'new@example.com', additionalEmails: [] },
        },
        preflight: {
          ...preflight,
          fieldDifferences: [
            {
              ...difference,
              fieldName: 'emails',
              subFieldPath: ['primaryEmail'],
            },
            {
              ...difference,
              fieldName: 'emails',
              subFieldPath: ['additionalEmails'],
              existingValue: [],
              incomingValue: ['new@example.com'],
              sourceState: 'VALUE',
            },
          ],
        },
        action: 'UPDATE_EXISTING',
        decisions: {
          [`field-id:primaryEmail`]: 'KEEP_EXISTING',
          [`field-id:additionalEmails`]: 'USE_INCOMING',
        },
      }),
    ).toEqual({
      id: 'record-1',
      emails: { additionalEmails: [] },
    });
  });

  it('omits an ignored optional field from a new record without dropping other fields', () => {
    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: {
          name: 'Company',
          domainName: { primaryLinkUrl: 'invalid_domain.com' },
          employees: 25,
        },
        preflight: undefined,
        action: 'CREATE',
        decisions: { domainKey: 'IGNORE_INCOMING_FIELD' },
        fields: [
          {
            key: 'domainKey',
            fieldMetadataName: 'domainName',
            compositeSubFieldKey: 'primaryLinkUrl',
            canIgnoreIncomingValue: true,
          },
        ],
      }),
    ).toEqual({ name: 'Company', employees: 25 });
  });

  it('does not compile an ignore decision for a protected identity field', () => {
    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: { sourceId: '128', name: 'Company' },
        preflight: undefined,
        action: 'CREATE',
        decisions: { sourceId: 'IGNORE_INCOMING_FIELD' },
        fields: [
          {
            key: 'sourceId',
            fieldMetadataName: 'sourceId',
            canIgnoreIncomingValue: false,
          },
        ],
      }),
    ).toEqual({ sourceId: '128', name: 'Company' });
  });

  it('preserves an existing CRM value when invalid incoming data is ignored during another update', () => {
    const domainDifference = {
      ...difference,
      fieldMetadataId: 'domain-id',
      fieldName: 'domainName',
      subFieldPath: ['primaryLinkUrl'],
      existingValue: { primaryLinkUrl: 'valid-company.com' },
      incomingValue: { primaryLinkUrl: 'invalid_domain.com' },
      sourceState: 'VALUE' as const,
    };
    const employeeDifference = {
      ...difference,
      fieldMetadataId: 'employee-id',
      fieldName: 'employees',
      existingValue: 40,
      incomingValue: 55,
      sourceState: 'VALUE' as const,
    };

    expect(
      compileSpreadsheetImportFieldDecisions({
        recordInput: {
          id: 'record-1',
          domainName: { primaryLinkUrl: 'invalid_domain.com' },
          employees: 55,
        },
        preflight: {
          ...preflight,
          fieldDifferences: [domainDifference, employeeDifference],
        },
        action: 'UPDATE_EXISTING',
        decisions: {
          domainKey: 'IGNORE_INCOMING_FIELD',
          'employee-id:': 'USE_INCOMING',
        },
        fields: [
          {
            key: 'domainKey',
            fieldMetadataName: 'domainName',
            compositeSubFieldKey: 'primaryLinkUrl',
            canIgnoreIncomingValue: true,
          },
        ],
      }),
    ).toEqual({ id: 'record-1', employees: 55 });
  });
});
