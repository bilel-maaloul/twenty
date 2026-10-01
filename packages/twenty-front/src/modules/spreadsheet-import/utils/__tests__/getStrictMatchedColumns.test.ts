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
    expect(getSpreadsheetImportHeaderValidationErrorMessage(result)).toContain(
      'Unknown A, Unknown B',
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
      'The spreadsheet does not contain a recognizable header row.',
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
