import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { type SpreadsheetImportHeaderDefinition } from '@/spreadsheet-import/types/SpreadsheetImportHeaderDefinition';
import {
  getSpreadsheetImportHeaderValidationErrorMessage,
  validateSpreadsheetImportHeaders,
} from '@/spreadsheet-import/utils/validateSpreadsheetImportHeaders';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const createField = (key: string): SpreadsheetImportField => ({
  Icon: null,
  fieldMetadataItemId: `${key}-id`,
  fieldMetadataType: FieldMetadataType.TEXT,
  fieldType: { type: 'input' },
  isNestedField: false,
  key,
  label: key,
});

const fields = [createField('name'), createField('country')];
const headerDefinitions = [
  { fieldKey: 'name', header: 'Name', kind: 'importable' },
  { fieldKey: 'country', header: 'Country', kind: 'importable' },
] satisfies SpreadsheetImportHeaderDefinition[];

const validate = ({
  data,
  fields: fieldsToValidate = fields,
  headerDefinitions: definitions = headerDefinitions,
  headerValues,
}: {
  data: (string | undefined)[][];
  fields?: SpreadsheetImportField[];
  headerDefinitions?: SpreadsheetImportHeaderDefinition[];
  headerValues: (string | undefined)[];
}) =>
  validateSpreadsheetImportHeaders({
    data,
    fieldKeys: new Set(fieldsToValidate.map(({ key }) => key)),
    headerDefinitions: definitions,
    headerValues,
  });

describe('getStrictMatchedColumns', () => {
  it('maps exact headers regardless of order and accepts subsets', () => {
    const result = validate({
      data: [['Tunisia', 'Acme']],
      fields,
      headerDefinitions,
      headerValues: ['Country', 'Name'],
    });

    expect(result.errors).toEqual([]);
    expect(result.recognizedColumnCount).toBe(2);
    expect(result.matches).toEqual([
      {
        columnIndex: 0,
        fieldKey: 'country',
        header: 'Country',
        kind: 'importable',
      },
      { columnIndex: 1, fieldKey: 'name', header: 'Name', kind: 'importable' },
    ]);

    const subsetResult = validate({
      data: [['Acme']],
      fields,
      headerDefinitions,
      headerValues: ['Name'],
    });

    expect(subsetResult.errors).toEqual([]);
    expect(subsetResult.recognizedColumnCount).toBe(1);
  });

  it('requires the complete canonical header set regardless of order or values', () => {
    const canonicalDefinitions = [
      { fieldKey: 'id', header: 'Record ID', kind: 'importable' },
      { fieldKey: 'name', header: 'Name', kind: 'importable' },
      { fieldKey: 'ownerName', header: 'Owner', kind: 'importable' },
      { fieldKey: 'ownerId', header: 'ID of Owner', kind: 'importable' },
      {
        fieldKey: 'domainLabel',
        header: 'Domain / Link label',
        kind: 'importable',
      },
      {
        fieldKey: 'domainUrl',
        header: 'Domain / Link URL',
        kind: 'importable',
      },
      { fieldKey: 'address', header: 'Address', kind: 'importable' },
      { fieldKey: 'city', header: 'City', kind: 'importable' },
      { fieldKey: 'customField', header: 'Custom Field', kind: 'importable' },
      { header: 'Created By', kind: 'readOnly' },
    ] satisfies SpreadsheetImportHeaderDefinition[];
    const canonicalFields = canonicalDefinitions
      .filter(
        (definition): definition is typeof definition & { fieldKey: string } =>
          definition.kind === 'importable',
      )
      .map(({ fieldKey }) => createField(fieldKey));
    const completeHeaders = canonicalDefinitions.map(({ header }) => header);

    const completeResult = validate({
      data: [completeHeaders.map(() => '')],
      fields: canonicalFields,
      headerDefinitions: canonicalDefinitions,
      headerValues: [...completeHeaders].reverse(),
    });

    expect(completeResult.errors).toEqual([]);
    expect(completeResult.missingHeaders).toEqual([]);
    expect(completeResult.recognizedColumnCount).toBe(completeHeaders.length);

    const missingSimpleHeaderResult = validate({
      data: [
        [
          'id',
          'owner',
          'owner-id',
          'domain-label',
          'domain-url',
          'address',
          'city',
          'custom',
          'creator',
        ],
      ],
      fields: canonicalFields,
      headerDefinitions: canonicalDefinitions,
      headerValues: completeHeaders.filter((header) => header !== 'Name'),
    });

    expect(missingSimpleHeaderResult.missingHeaders).toEqual(['Name']);

    const missingSeveralHeadersResult = validate({
      data: [
        [
          'name',
          'domain-label',
          'domain-url',
          'address',
          'city',
          'custom',
          'creator',
        ],
      ],
      fields: canonicalFields,
      headerDefinitions: canonicalDefinitions,
      headerValues: completeHeaders.filter(
        (header) => !['Record ID', 'Owner', 'ID of Owner'].includes(header),
      ),
    });

    expect(missingSeveralHeadersResult.missingHeaders).toEqual([
      'Record ID',
      'Owner',
      'ID of Owner',
    ]);
  });

  it('reports missing relation, compound, and custom headers independently', () => {
    const definitions = [
      { fieldKey: 'name', header: 'Name', kind: 'importable' },
      { fieldKey: 'ownerName', header: 'Owner', kind: 'importable' },
      { fieldKey: 'ownerId', header: 'ID of Owner', kind: 'importable' },
      {
        fieldKey: 'domainLabel',
        header: 'Domain / Link label',
        kind: 'importable',
      },
      {
        fieldKey: 'domainUrl',
        header: 'Domain / Link URL',
        kind: 'importable',
      },
      { fieldKey: 'address', header: 'Address', kind: 'importable' },
      { fieldKey: 'city', header: 'City', kind: 'importable' },
      { fieldKey: 'customField', header: 'Custom Field', kind: 'importable' },
    ] satisfies SpreadsheetImportHeaderDefinition[];
    const fieldsToValidate = definitions.map(({ fieldKey }) =>
      createField(fieldKey as string),
    );
    const allHeaders = definitions.map(({ header }) => header);

    expect(
      validate({
        data: [['value']],
        fields: fieldsToValidate,
        headerDefinitions: definitions,
        headerValues: allHeaders.filter((header) => header !== 'Owner'),
      }).missingHeaders,
    ).toEqual(['Owner']);
    expect(
      validate({
        data: [['value']],
        fields: fieldsToValidate,
        headerDefinitions: definitions,
        headerValues: allHeaders.filter((header) => header !== 'ID of Owner'),
      }).missingHeaders,
    ).toEqual(['ID of Owner']);
    expect(
      validate({
        data: [['value']],
        fields: fieldsToValidate,
        headerDefinitions: definitions,
        headerValues: allHeaders.filter(
          (header) => header !== 'Domain / Link URL',
        ),
      }).missingHeaders,
    ).toEqual(['Domain / Link URL']);
    expect(
      validate({
        data: [['value']],
        fields: fieldsToValidate,
        headerDefinitions: definitions,
        headerValues: allHeaders.filter((header) => header !== 'City'),
      }).missingHeaders,
    ).toEqual(['City']);
    expect(
      validate({
        data: [['value']],
        fields: fieldsToValidate,
        headerDefinitions: definitions,
        headerValues: allHeaders.filter((header) => header !== 'Custom Field'),
      }).missingHeaders,
    ).toEqual(['Custom Field']);
  });

  it('keeps missing-header diagnostics alongside unknown and duplicate errors', () => {
    const definitions = [
      { fieldKey: 'name', header: 'Name', kind: 'importable' },
      { fieldKey: 'owner', header: 'Owner', kind: 'importable' },
    ] satisfies SpreadsheetImportHeaderDefinition[];
    const fieldsToValidate = [createField('name'), createField('owner')];

    const unknownResult = validate({
      data: [['owner', 'unknown']],
      fields: fieldsToValidate,
      headerDefinitions: definitions,
      headerValues: ['Owner', 'Unknown'],
    });

    expect(unknownResult.missingHeaders).toEqual(['Name']);
    expect(unknownResult.errors).toEqual([
      { columnIndex: 1, header: 'Unknown', type: 'unknown' },
    ]);
    expect(
      getSpreadsheetImportHeaderValidationErrorMessage(unknownResult),
    ).toBe(
      'This spreadsheet cannot be imported. Missing expected headers: Name. Other header problems: Unknown: does not match a field in this CRM object',
    );

    const duplicateResult = validate({
      data: [['owner', 'owner']],
      fields: fieldsToValidate,
      headerDefinitions: definitions,
      headerValues: ['Owner', 'Owner'],
    });

    expect(duplicateResult.missingHeaders).toEqual(['Name', 'Owner']);
    expect(duplicateResult.errors).toEqual([
      { columnIndex: 0, header: 'Owner', type: 'duplicate' },
      { columnIndex: 1, header: 'Owner', type: 'duplicate' },
    ]);
  });

  it('only trims surrounding whitespace and preserves Unicode matching', () => {
    const result = validate({
      data: [['Tunisia']],
      fields: [createField('country')],
      headerDefinitions: [
        { fieldKey: 'country', header: 'État', kind: 'importable' },
      ],
      headerValues: ['  État  '],
    });

    expect(result.errors).toEqual([]);
    expect(result.matches).toEqual([
      {
        columnIndex: 0,
        fieldKey: 'country',
        header: '  État  ',
        kind: 'importable',
      },
    ]);
  });

  it('reports every unknown header without inspecting values', () => {
    const result = validate({
      data: [
        ['Airbnb', 'airbnb.com'],
        ['Stripe', 'stripe.com'],
      ],
      fields,
      headerDefinitions,
      headerValues: ['Unknown A', 'Unknown B'],
    });

    expect(result.recognizedColumnCount).toBe(0);
    expect(result.errors).toEqual([
      { columnIndex: 0, header: 'Unknown A', type: 'unknown' },
      { columnIndex: 1, header: 'Unknown B', type: 'unknown' },
    ]);
    expect(getSpreadsheetImportHeaderValidationErrorMessage(result)).toBe(
      'This spreadsheet cannot be imported. Missing expected headers: Name, Country. Other header problems: Unknown A: does not match a field in this CRM object; Unknown B: does not match a field in this CRM object',
    );
  });

  it('explains unknown headers even when another canonical header is valid', () => {
    const result = validate({
      data: [['Acme', 'unexpected']],
      fields: [createField('name')],
      headerDefinitions: [
        { fieldKey: 'name', header: 'Name', kind: 'importable' },
      ],
      headerValues: ['Name', 'Phone Number 2'],
    });

    expect(getSpreadsheetImportHeaderValidationErrorMessage(result)).toBe(
      'This file does not match the CRM import format. Header problems: Phone Number 2: does not match a field in this CRM object',
    );
  });

  it('recognizes read-only headers without assigning an import field', () => {
    const result = validate({
      data: [['Created by', 'Acme']],
      headerDefinitions: [
        { header: 'Created By', kind: 'readOnly' },
        { fieldKey: 'name', header: 'Name', kind: 'importable' },
      ],
      headerValues: ['Created By', 'Name'],
    });

    expect(result.errors).toEqual([]);
    expect(result.recognizedColumnCount).toBe(2);
    expect(result.matches).toEqual([
      { columnIndex: 0, header: 'Created By', kind: 'readOnly' },
      {
        columnIndex: 1,
        fieldKey: 'name',
        header: 'Name',
        kind: 'importable',
      },
    ]);
  });

  it('rejects duplicate, ambiguous, and populated unnamed headers', () => {
    const duplicateResult = validate({
      data: [['Acme', 'Tunisia', 'Other']],
      fields,
      headerDefinitions,
      headerValues: ['Name', 'Country', 'Name'],
    });

    expect(duplicateResult.errors).toEqual([
      { columnIndex: 0, header: 'Name', type: 'duplicate' },
      { columnIndex: 2, header: 'Name', type: 'duplicate' },
    ]);

    const ambiguousResult = validate({
      data: [['Acme']],
      fields,
      headerDefinitions: [
        { fieldKey: 'name', header: 'Label', kind: 'importable' },
        { fieldKey: 'country', header: 'Label', kind: 'importable' },
      ],
      headerValues: ['Label'],
    });

    expect(ambiguousResult.errors[0]).toMatchObject({ type: 'ambiguous' });

    const unnamedResult = validate({
      data: [['Acme', 'Tunisia']],
      fields,
      headerDefinitions,
      headerValues: ['Name', ''],
    });

    expect(unnamedResult.errors).toContainEqual({
      columnIndex: 1,
      header: '',
      type: 'unnamed',
    });
  });

  it('ignores trailing empty columns and rejects empty/headerless sheets', () => {
    const trailingEmptyResult = validate({
      data: [['Acme', undefined, undefined]],
      fields,
      headerDefinitions,
      headerValues: ['Name', undefined, undefined],
    });

    expect(trailingEmptyResult.errors).toEqual([]);
    expect(trailingEmptyResult.matches).toHaveLength(3);
    expect(trailingEmptyResult.matches[1]).toEqual({
      columnIndex: 1,
      header: '',
    });

    const emptyResult = validate({
      data: [],
      fields,
      headerDefinitions,
      headerValues: [],
    });

    expect(emptyResult.recognizedColumnCount).toBe(0);
    expect(getSpreadsheetImportHeaderValidationErrorMessage(emptyResult)).toBe(
      'This spreadsheet cannot be imported. Missing expected headers: Name, Country',
    );

    const headerlessResult = validate({
      data: [['Airbnb', 'airbnb.com']],
      fields,
      headerDefinitions,
      headerValues: ['Airbnb', 'airbnb.com'],
    });

    expect(headerlessResult.recognizedColumnCount).toBe(0);
    expect(headerlessResult.errors).toHaveLength(2);
  });
});
