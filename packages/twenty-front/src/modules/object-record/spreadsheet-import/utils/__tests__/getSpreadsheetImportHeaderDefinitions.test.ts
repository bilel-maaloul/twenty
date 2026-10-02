import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { getSpreadsheetImportHeaderDefinitions } from '@/object-record/spreadsheet-import/utils/getSpreadsheetImportHeaderDefinitions';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { validateSpreadsheetImportHeaders } from '@/spreadsheet-import/utils/validateSpreadsheetImportHeaders';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

jest.mock(
  '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem',
  () => ({
    getLabelIdentifierFieldMetadataItem: (objectMetadataItem: {
      fields: FieldMetadataItem[];
      labelIdentifierFieldMetadataId: string;
    }) =>
      objectMetadataItem.fields.find(
        (field) =>
          field.id === objectMetadataItem.labelIdentifierFieldMetadataId,
      ),
  }),
);

const createFieldMetadata = (
  overrides: Partial<FieldMetadataItem>,
): FieldMetadataItem =>
  ({
    id: 'field-id',
    name: 'fieldName',
    label: 'Field name',
    type: FieldMetadataType.TEXT,
    isActive: true,
    ...overrides,
  }) as FieldMetadataItem;

const createImportField = (
  overrides: Partial<SpreadsheetImportField>,
): SpreadsheetImportField => ({
  Icon: null,
  fieldMetadataItemId: 'field-id',
  fieldMetadataType: FieldMetadataType.TEXT,
  fieldType: { type: 'input' },
  isNestedField: false,
  key: 'fieldName',
  label: 'Field name',
  ...overrides,
});

const createObjectMetadata = (
  overrides: Partial<EnrichedObjectMetadataItem>,
): EnrichedObjectMetadataItem =>
  ({
    id: 'object-id',
    fields: [],
    labelIdentifierFieldMetadataId: 'name-id',
    ...overrides,
  }) as EnrichedObjectMetadataItem;

describe('getSpreadsheetImportHeaderDefinitions', () => {
  it('maps current custom and compound export headers to importer keys', () => {
    const fullNameField = createFieldMetadata({
      id: 'full-name-id',
      name: 'contactName',
      label: 'Contact name',
      type: FieldMetadataType.FULL_NAME,
    });
    const customField = createFieldMetadata({
      id: 'tax-number-id',
      name: 'taxNumber',
      label: 'Numéro fiscal',
    });
    const recordIdField = createFieldMetadata({
      id: 'record-id',
      name: 'id',
      label: 'ID',
      type: FieldMetadataType.UUID,
    });

    const definitions = getSpreadsheetImportHeaderDefinitions({
      fieldMetadataItems: [recordIdField, fullNameField, customField],
      objectMetadataItems: [],
      spreadsheetImportFields: [
        createImportField({
          fieldMetadataItemId: fullNameField.id,
          fieldMetadataType: FieldMetadataType.FULL_NAME,
          isCompositeSubField: true,
          key: getCompositeSubFieldKey(fullNameField, 'firstName'),
          label: 'Contact name / First Name',
          compositeSubFieldKey: 'firstName',
        }),
        createImportField({
          fieldMetadataItemId: fullNameField.id,
          fieldMetadataType: FieldMetadataType.FULL_NAME,
          isCompositeSubField: true,
          key: getCompositeSubFieldKey(fullNameField, 'lastName'),
          label: 'Contact name / Last Name',
          compositeSubFieldKey: 'lastName',
        }),
        createImportField({
          fieldMetadataItemId: customField.id,
          key: customField.name,
          label: customField.label,
        }),
        createImportField({
          key: 'id',
          fieldMetadataItemId: recordIdField.id,
          fieldMetadataType: FieldMetadataType.UUID,
        }),
      ],
    });

    expect(definitions).toEqual([
      { header: 'Record ID', fieldKey: 'id', kind: 'importable' },
      {
        header: 'First Name',
        fieldKey: 'First Name (contactName)',
        kind: 'importable',
      },
      {
        header: 'Last Name',
        fieldKey: 'Last Name (contactName)',
        kind: 'importable',
      },
      { header: 'Numéro fiscal', fieldKey: 'taxNumber', kind: 'importable' },
    ]);
  });

  it('maps relation display and relation ID columns to existing relation fields', () => {
    const relationField = createFieldMetadata({
      id: 'company-relation-id',
      name: 'company',
      label: 'Company',
      type: FieldMetadataType.RELATION,
      relation: {
        type: RelationType.MANY_TO_ONE,
        targetObjectMetadata: { id: 'company-object-id' },
      } as FieldMetadataItem['relation'],
    });
    const targetNameField = createFieldMetadata({
      id: 'company-name-id',
      name: 'name',
      label: 'Name',
      type: FieldMetadataType.TEXT,
    });
    const targetObject = createObjectMetadata({
      id: 'company-object-id',
      fields: [targetNameField],
      labelIdentifierFieldMetadataId: targetNameField.id,
    });

    const definitions = getSpreadsheetImportHeaderDefinitions({
      fieldMetadataItems: [relationField],
      objectMetadataItems: [targetObject],
      spreadsheetImportFields: [
        createImportField({
          fieldMetadataItemId: relationField.id,
          fieldMetadataType: FieldMetadataType.RELATION,
          isNestedField: true,
          isRelationConnectField: true,
          key: 'name (company)',
          label: 'Company / Name',
          uniqueFieldMetadataItem: targetNameField,
        }),
        createImportField({
          fieldMetadataItemId: relationField.id,
          fieldMetadataType: FieldMetadataType.RELATION,
          isNestedField: true,
          isRelationConnectField: true,
          key: 'id (company)',
          label: 'Company / ID',
          uniqueFieldMetadataItem: createFieldMetadata({
            id: 'company-id-id',
            name: 'id',
            label: 'ID',
            type: FieldMetadataType.UUID,
          }),
        }),
        createImportField({ key: 'id', fieldMetadataItemId: 'record-id' }),
      ],
    });

    expect(definitions).toEqual([
      { header: 'Record ID', fieldKey: 'id', kind: 'importable' },
      {
        header: 'Company',
        fieldKey: 'name (company)',
        kind: 'importable',
      },
      {
        header: 'ID of Company',
        fieldKey: 'id (company)',
        kind: 'importable',
      },
    ]);
  });

  it('recognizes exported read-only and unsupported compound columns', () => {
    const nameField = createFieldMetadata({
      id: 'name-field-id',
      name: 'name',
      label: 'Name',
      type: FieldMetadataType.TEXT,
    });
    const domainField = createFieldMetadata({
      id: 'domain-field-id',
      name: 'domainName',
      label: 'Domain Name',
      type: FieldMetadataType.LINKS,
    });
    const linkedinField = createFieldMetadata({
      id: 'linkedin-field-id',
      name: 'linkedinLink',
      label: 'Linkedin',
      type: FieldMetadataType.LINKS,
    });
    const addressField = createFieldMetadata({
      id: 'address-field-id',
      name: 'address',
      label: 'Address',
      type: FieldMetadataType.ADDRESS,
    });
    const accountOwnerField = createFieldMetadata({
      id: 'account-owner-field-id',
      name: 'accountOwner',
      label: 'Account Owner',
      type: FieldMetadataType.RELATION,
      relation: {
        type: RelationType.MANY_TO_ONE,
        targetObjectMetadata: { id: 'user-object-id' },
      } as FieldMetadataItem['relation'],
    });
    const createdByField = createFieldMetadata({
      id: 'created-by-field-id',
      name: 'createdBy',
      label: 'Created By',
      type: FieldMetadataType.ACTOR,
      isSystem: true,
      isUIEditable: false,
    });
    const createdAtField = createFieldMetadata({
      id: 'created-at-field-id',
      name: 'createdAt',
      label: 'Creation Date',
      type: FieldMetadataType.DATE_TIME,
      isSystem: true,
      isUIEditable: false,
    });
    const recordIdField = createFieldMetadata({
      id: 'record-id-field-id',
      name: 'id',
      label: 'ID',
      type: FieldMetadataType.UUID,
    });
    const userNameField = createFieldMetadata({
      id: 'user-name-field-id',
      name: 'name',
      label: 'Name',
      type: FieldMetadataType.TEXT,
    });
    const userObject = createObjectMetadata({
      id: 'user-object-id',
      fields: [userNameField],
      labelIdentifierFieldMetadataId: userNameField.id,
    });

    const importFields = [
      createImportField({ key: 'id', fieldMetadataItemId: recordIdField.id }),
      createImportField({
        key: nameField.name,
        fieldMetadataItemId: nameField.id,
        label: nameField.label,
      }),
      ...['primaryLinkLabel', 'primaryLinkUrl', 'secondaryLinks'].map(
        (subFieldName) =>
          createImportField({
            fieldMetadataItemId: domainField.id,
            fieldMetadataType: FieldMetadataType.LINKS,
            isNestedField: true,
            isCompositeSubField: true,
            compositeSubFieldKey: subFieldName,
            key: getCompositeSubFieldKey(domainField, subFieldName),
          }),
      ),
      ...[
        'addressStreet1',
        'addressStreet2',
        'addressCity',
        'addressState',
        'addressCountry',
        'addressPostcode',
      ].map((subFieldName) =>
        createImportField({
          fieldMetadataItemId: addressField.id,
          fieldMetadataType: FieldMetadataType.ADDRESS,
          isNestedField: true,
          isCompositeSubField: true,
          compositeSubFieldKey: subFieldName,
          key: getCompositeSubFieldKey(addressField, subFieldName),
        }),
      ),
      createImportField({
        fieldMetadataItemId: accountOwnerField.id,
        fieldMetadataType: FieldMetadataType.RELATION,
        isNestedField: true,
        isRelationConnectField: true,
        key: 'name (accountOwner)',
        uniqueFieldMetadataItem: userNameField,
      }),
      createImportField({
        fieldMetadataItemId: accountOwnerField.id,
        fieldMetadataType: FieldMetadataType.RELATION,
        isNestedField: true,
        isRelationConnectField: true,
        key: 'id (accountOwner)',
        uniqueFieldMetadataItem: recordIdField,
      }),
      createImportField({
        fieldMetadataItemId: createdAtField.id,
        fieldMetadataType: FieldMetadataType.DATE_TIME,
        key: createdAtField.name,
      }),
    ];

    const definitions = getSpreadsheetImportHeaderDefinitions({
      fieldMetadataItems: [
        recordIdField,
        nameField,
        domainField,
        linkedinField,
        addressField,
        accountOwnerField,
        createdByField,
        createdAtField,
      ],
      objectMetadataItems: [userObject],
      spreadsheetImportFields: importFields,
    });

    expect(
      definitions.find(({ header }) => header === 'Record ID'),
    ).toMatchObject({ fieldKey: 'id', kind: 'importable' });
    expect(
      definitions.find(({ fieldKey }) => fieldKey === 'Link URL (domainName)'),
    ).toMatchObject({ kind: 'importable' });
    expect(
      definitions.find(({ header }) => header === 'Domain Name / Link URL'),
    ).toMatchObject({
      fieldKey: 'Link URL (domainName)',
      kind: 'importable',
    });
    expect(
      definitions.find(({ header }) => header === 'Latitude'),
    ).toMatchObject({ kind: 'readOnly' });
    expect(
      definitions.find(({ header }) => header === 'Created By'),
    ).toMatchObject({ kind: 'readOnly' });
    expect(
      definitions.find(({ header }) => header === 'Creation Date'),
    ).toMatchObject({ kind: 'readOnly' });
    expect(
      definitions.find(({ header }) => header === 'Account Owner'),
    ).toMatchObject({ fieldKey: 'name (accountOwner)', kind: 'importable' });
    expect(
      definitions.find(({ header }) => header === 'ID of Account Owner'),
    ).toMatchObject({ fieldKey: 'id (accountOwner)', kind: 'importable' });

    const validation = validateSpreadsheetImportHeaders({
      data: [definitions.map(() => 'exported value')],
      fieldKeys: new Set(importFields.map(({ key }) => key)),
      headerDefinitions: definitions,
      headerValues: definitions.map(({ header }) => header),
    });

    expect(validation.errors).toEqual([]);
    expect(validation.missingHeaders).toEqual([]);
    expect(validation.recognizedColumnCount).toBe(definitions.length);

    const validateHeaders = (headerValues: string[]) =>
      validateSpreadsheetImportHeaders({
        data: [headerValues.map(() => '')],
        fieldKeys: new Set(importFields.map(({ key }) => key)),
        headerDefinitions: definitions,
        headerValues,
      });
    const expectedHeaders = definitions.map(({ header }) => header);

    expect(
      validateHeaders(expectedHeaders.filter((header) => header !== 'Name'))
        .missingHeaders,
    ).toEqual(['Name']);
    expect(
      validateHeaders(
        expectedHeaders.filter((header) => header !== 'Record ID'),
      ).missingHeaders,
    ).toEqual(['Record ID']);
    expect(
      validateHeaders(
        expectedHeaders.filter((header) => header !== 'Account Owner'),
      ).missingHeaders,
    ).toEqual(['Account Owner']);
    expect(
      validateHeaders(
        expectedHeaders.filter(
          (header) => !['Name', 'Record ID', 'Account Owner'].includes(header),
        ),
      ).missingHeaders,
    ).toEqual(['Record ID', 'Name', 'Account Owner']);
  });
});
