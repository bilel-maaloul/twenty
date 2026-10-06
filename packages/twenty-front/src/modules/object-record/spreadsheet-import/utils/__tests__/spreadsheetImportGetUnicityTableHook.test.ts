import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportDuplicateGroup,
} from '@/spreadsheet-import/types';
import { IndexType } from '~/generated-metadata/graphql';
import { FieldMetadataType } from 'twenty-shared/types';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

jest.mock('transliteration', () => ({
  transliterate: (value: string) => value,
  slugify: (value: string) => value,
}));

describe('spreadsheetImportGetUnicityTableHook', () => {
  const baseMockCompany = getMockObjectMetadataItemOrThrow('company');

  const nameField = getMockFieldMetadataItemOrThrow({
    objectMetadataItem: baseMockCompany,
    fieldName: 'name',
  });

  const domainNameField = getMockFieldMetadataItemOrThrow({
    objectMetadataItem: baseMockCompany,
    fieldName: 'domainName',
  });

  const employeesField = getMockFieldMetadataItemOrThrow({
    objectMetadataItem: baseMockCompany,
    fieldName: 'employees',
  });

  const sourceIdField = {
    ...nameField,
    id: 'company-source-id-field',
    name: 'idSourceTunisieIndustrie',
    label: 'ID source Tunisie Industrie',
    type: FieldMetadataType.TEXT,
  };

  const mockObjectMetadataItem: EnrichedObjectMetadataItem = {
    ...baseMockCompany,
    fields: [...baseMockCompany.fields, sourceIdField],
    indexMetadatas: [
      {
        id: 'unique-name-index',
        name: 'unique_name_idx',
        indexType: IndexType.BTREE,
        isUnique: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        indexFieldMetadatas: [
          {
            id: 'index-field-2',
            fieldMetadataId: domainNameField.id,
            order: 0,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        id: 'unique-domain-name-index',
        name: 'unique_domain_name_idx',
        indexType: IndexType.BTREE,
        isUnique: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        indexFieldMetadatas: [
          {
            id: 'index-field-1',
            fieldMetadataId: nameField.id,
            order: 0,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'index-field-3',
            fieldMetadataId: employeesField.id,
            order: 1,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        id: 'unique-source-id-index',
        name: 'unique_source_id_idx',
        indexType: IndexType.BTREE,
        isUnique: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        indexFieldMetadatas: [
          {
            id: 'index-field-source-id',
            fieldMetadataId: sourceIdField.id,
            order: 0,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    ],
  };

  it('marks rows for explicit resolution if a composite unique field repeats', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);
    const testData: ImportedStructuredRow[] = [
      { 'Link URL (domainName)': 'https://duplicaTe.com' },
      { 'Link URL (domainName)': 'https://duplicate.com' },
      { 'Link URL (domainName)': 'https://other.com' },
    ];

    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result).toBe(testData);
    expect(result[0].__duplicateInFile).toBe(true);
    expect(result[1].__duplicateInFile).toBe(true);
  });

  it('marks rows for explicit resolution if a primary ID repeats', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);

    const testData: ImportedStructuredRow[] = [
      { 'Link URL (domainName)': 'test.com', id: '1' },
      { 'Link URL (domainName)': 'test2.com', id: '1' },
      { 'Link URL (domainName)': 'test3.com', id: '3' },
    ];

    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result).toBe(testData);
    expect(result[0].__duplicateInFile).toBe(true);
    expect(result[1].__duplicateInFile).toBe(true);
  });

  it('detects duplicate values in a metadata-defined unique source ID', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);
    const testData: ImportedStructuredRow[] = [
      { idSourceTunisieIndustrie: '1089', name: 'Company A' },
      { idSourceTunisieIndustrie: '1089', name: 'Company B' },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result[0].__duplicateInFile).toBe(true);
    expect(result[1].__duplicateInFile).toBe(true);
    const duplicateGroups = JSON.parse(
      String(result[0].__duplicateInFileGroups ?? '[]'),
    ) as SpreadsheetImportDuplicateGroup[];
    expect(duplicateGroups).toHaveLength(1);
    expect(duplicateGroups[0]).toMatchObject({
      kind: 'unique-constraint',
      fields: [{ label: sourceIdField.label, value: '1089' }],
      rows: [
        { rowNumber: 2, label: 'Company A' },
        { rowNumber: 3, label: 'Company B' },
      ],
    });
    expect(duplicateGroups[0].id).toBeTruthy();
  });

  it('preserves case-sensitive TEXT index semantics for distinct source IDs', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);
    const testData: ImportedStructuredRow[] = [
      { idSourceTunisieIndustrie: 'ABC-123', name: 'Company A' },
      { idSourceTunisieIndustrie: 'abc-123', name: 'Company B' },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result[0].__duplicateInFile).toBeUndefined();
    expect(result[1].__duplicateInFile).toBeUndefined();
  });

  it('marks rows for explicit resolution if a compound unique value repeats', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);

    const testData: ImportedStructuredRow[] = [
      { name: 'test', employees: '100', id: '1' },
      { name: 'test', employees: '100', id: '2' },
      { name: 'test', employees: '101', id: '3' },
    ];

    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result).toBe(testData);
    expect(result[0].__duplicateInFile).toBe(true);
    expect(result[1].__duplicateInFile).toBe(true);
  });

  it('does not treat distinct composite unique values as duplicates when concatenated values match', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);
    const testData: ImportedStructuredRow[] = [
      {
        name: 'ab',
        employees: 'c',
        'Link URL (domainName)': 'first.example',
      },
      {
        name: 'a',
        employees: 'bc',
        'Link URL (domainName)': 'second.example',
      },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result[0].__duplicateInFile).toBeUndefined();
    expect(result[1].__duplicateInFile).toBeUndefined();
  });

  it('does not treat empty IDs or shared non-unique values as duplicates', () => {
    const sourceIdIndex = mockObjectMetadataItem.indexMetadatas.find(
      ({ id }) => id === 'unique-source-id-index',
    );
    const hook = spreadsheetImportGetUnicityTableHook({
      ...mockObjectMetadataItem,
      indexMetadatas: sourceIdIndex ? [sourceIdIndex] : [],
    });
    const testData: ImportedStructuredRow[] = [
      {
        id: '',
        idSourceTunisieIndustrie: '',
        name: 'First company',
        'Primary Email (eMail)': 'shared@example.com',
        'Primary Phone Number (telephone)': '+216 70 000 001',
        'Link URL (domainName)': 'shared.example',
      },
      {
        id: '',
        idSourceTunisieIndustrie: '',
        name: 'Second company',
        'Primary Email (eMail)': 'shared@example.com',
        'Primary Phone Number (telephone)': '+216 70 000 001',
        'Link URL (domainName)': 'shared.example',
      },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result[0].__duplicateInFile).toBeUndefined();
    expect(result[1].__duplicateInFile).toBeUndefined();
  });

  it('does not treat shared email, phone, or website values as duplicates when those fields are not unique', () => {
    const sourceIdIndex = mockObjectMetadataItem.indexMetadatas.find(
      ({ id }) => id === 'unique-source-id-index',
    );
    const hook = spreadsheetImportGetUnicityTableHook({
      ...mockObjectMetadataItem,
      indexMetadatas: sourceIdIndex ? [sourceIdIndex] : [],
    });
    const testData: ImportedStructuredRow[] = [
      {
        idSourceTunisieIndustrie: '123',
        name: 'Company A',
        email: 'shared@example.com',
        phone: '+216 70 000 001',
        website: 'shared.example',
      },
      {
        idSourceTunisieIndustrie: '456',
        name: 'Company B',
        email: 'shared@example.com',
        phone: '+216 70 000 001',
        website: 'shared.example',
      },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result[0].__duplicateInFile).toBeUndefined();
    expect(result[1].__duplicateInFile).toBeUndefined();
  });

  it('allows distinct source IDs to share a Company domain', () => {
    const sourceIdIndex = mockObjectMetadataItem.indexMetadatas.find(
      ({ id }) => id === 'unique-source-id-index',
    );
    const hook = spreadsheetImportGetUnicityTableHook({
      ...mockObjectMetadataItem,
      indexMetadatas: sourceIdIndex ? [sourceIdIndex] : [],
    });
    const testData: ImportedStructuredRow[] = [
      {
        name: 'STE AGRO ZITEX',
        idSourceTunisieIndustrie: '128',
        'Link URL (domainName)': 'groupe_zitex.com.tn',
      },
      {
        name: 'STE AGRO-EXPORT',
        idSourceTunisieIndustrie: '129',
        'Link URL (domainName)': 'groupe_zitex.com.tn',
      },
      {
        name: 'AIR LIQUIDE TUNISIE',
        idSourceTunisieIndustrie: '142',
        'Link URL (domainName)': 'airliquide.com',
      },
      {
        name: 'AIR LIQUIDE TUNISIE (NLLE MEDINA)',
        idSourceTunisieIndustrie: '143',
        'Link URL (domainName)': 'airliquide.com',
      },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result.map(({ __duplicateInFile }) => __duplicateInFile)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('should not add error if row values are unique', () => {
    const hook = spreadsheetImportGetUnicityTableHook(mockObjectMetadataItem);

    const testData: ImportedStructuredRow[] = [
      {
        name: 'test',
        'Link URL (domainName)': 'test.com',
        employees: '100',
        id: '1',
      },
      {
        name: 'test',
        'Link URL (domainName)': 'test2.com',
        employees: '101',
        id: '2',
      },
      {
        name: 'test',
        'Link URL (domainName)': 'test3.com',
        employees: '102',
        id: '3',
      },
    ];

    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result).toBe(testData);
    expect(result[0].__duplicateInFile).toBeUndefined();
    expect(result[1].__duplicateInFile).toBeUndefined();
  });

  it('marks exact duplicate rows even when the object has no unique business fields', () => {
    const hook = spreadsheetImportGetUnicityTableHook({
      ...baseMockCompany,
      indexMetadatas: [],
    });
    const testData: ImportedStructuredRow[] = [
      { city: 'Sfax', company: 'Acme', __index: 'generated-id-1' },
      { city: 'Sfax', company: 'Acme', __index: 'generated-id-2' },
    ];
    const addErrorMock = jest.fn();

    const result = hook(testData, addErrorMock);

    expect(addErrorMock).not.toHaveBeenCalled();
    expect(result).toBe(testData);
    expect(result[0].__duplicateInFile).toBe(true);
    expect(result[1].__duplicateInFile).toBe(true);
    const duplicateGroups = JSON.parse(
      String(result[0].__duplicateInFileGroups ?? '[]'),
    ) as SpreadsheetImportDuplicateGroup[];
    expect(duplicateGroups).toEqual([
      {
        id: expect.any(String),
        kind: 'exact-row',
        fields: [{ label: 'Entire row', value: '' }],
        rows: [{ rowNumber: 2 }, { rowNumber: 3 }],
      },
    ]);
  });
});
