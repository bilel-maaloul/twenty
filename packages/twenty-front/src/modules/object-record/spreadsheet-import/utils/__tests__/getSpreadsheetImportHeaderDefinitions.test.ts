import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { getSpreadsheetImportHeaderDefinitions } from '@/object-record/spreadsheet-import/utils/getSpreadsheetImportHeaderDefinitions';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { validateSpreadsheetImportHeaders } from '@/spreadsheet-import/utils/validateSpreadsheetImportHeaders';
import {
  getSpreadsheetExportColumns,
  getSpreadsheetExportHeader,
} from '@/spreadsheet/utils/getSpreadsheetExportData';
import { getSpreadsheetExportColumnDefinitions } from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { getSpreadsheetExportFieldMetadataItems } from '@/spreadsheet/utils/getSpreadsheetExportFieldMetadataItems';
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

  it('uses the actual visible export fields as the strict import schema', () => {
    const recordIdField = createFieldMetadata({
      id: 'company-record-id',
      name: 'id',
      label: 'Id',
      type: FieldMetadataType.UUID,
      isSystem: true,
      isUIEditable: false,
    });
    const nameField = createFieldMetadata({
      id: 'company-name',
      name: 'name',
      label: 'Name',
      isSystem: false,
      isUIEditable: true,
    });
    const domainField = createFieldMetadata({
      id: 'company-domain',
      name: 'domainName',
      label: 'Domain Name',
      type: FieldMetadataType.LINKS,
      isSystem: false,
      isUIEditable: true,
    });
    const addressField = createFieldMetadata({
      id: 'company-address',
      name: 'address',
      label: 'Address',
      type: FieldMetadataType.ADDRESS,
      isSystem: false,
      isUIEditable: true,
    });
    const accountOwnerField = createFieldMetadata({
      id: 'company-account-owner',
      name: 'accountOwner',
      label: 'Account Owner',
      type: FieldMetadataType.RELATION,
      isSystem: false,
      isUIEditable: true,
      relation: {
        type: RelationType.MANY_TO_ONE,
        targetObjectMetadata: { id: 'workspace-member-object' },
      } as FieldMetadataItem['relation'],
    });
    const createdByField = createFieldMetadata({
      id: 'company-created-by',
      name: 'createdBy',
      label: 'Created by',
      type: FieldMetadataType.ACTOR,
      isSystem: true,
      isUIEditable: false,
    });
    const createdAtField = createFieldMetadata({
      id: 'company-created-at',
      name: 'createdAt',
      label: 'Creation date',
      type: FieldMetadataType.DATE_TIME,
      isSystem: true,
      isUIEditable: false,
    });
    const employeesField = createFieldMetadata({
      id: 'company-employees',
      name: 'employees',
      label: 'Employees',
      type: FieldMetadataType.NUMBER,
      isSystem: false,
      isUIEditable: true,
    });
    const linkedinField = createFieldMetadata({
      id: 'company-linkedin',
      name: 'linkedinLink',
      label: 'Linkedin',
      type: FieldMetadataType.LINKS,
      isSystem: false,
      isUIEditable: true,
    });
    const customField = createFieldMetadata({
      id: 'company-custom',
      name: 'customField',
      label: 'Custom Field',
      isSystem: false,
      isUIEditable: true,
    });
    const annualRecurringRevenueField = createFieldMetadata({
      id: 'company-arr',
      name: 'annualRecurringRevenue',
      label: 'ARR',
      type: FieldMetadataType.CURRENCY,
      isSystem: false,
      isUIEditable: true,
    });
    const internalFields = [
      createFieldMetadata({
        id: 'company-updated-at',
        name: 'updatedAt',
        label: 'Last update',
        type: FieldMetadataType.DATE_TIME,
        isSystem: true,
        isUIEditable: false,
      }),
      createFieldMetadata({
        id: 'company-deleted-at',
        name: 'deletedAt',
        label: 'Deleted at',
        type: FieldMetadataType.DATE_TIME,
        isSystem: true,
        isUIEditable: false,
      }),
      createFieldMetadata({
        id: 'company-position',
        name: 'position',
        label: 'Position',
        type: FieldMetadataType.POSITION,
        isSystem: true,
        isUIEditable: true,
      }),
      createFieldMetadata({
        id: 'company-updated-by',
        name: 'updatedBy',
        label: 'Updated by',
        type: FieldMetadataType.ACTOR,
        isSystem: true,
        isUIEditable: false,
      }),
      createFieldMetadata({
        id: 'company-search-vector',
        name: 'searchVector',
        label: 'Search vector',
        type: FieldMetadataType.TS_VECTOR,
        isSystem: true,
        isUIEditable: true,
      }),
    ];
    const companyFields = [
      recordIdField,
      nameField,
      domainField,
      addressField,
      accountOwnerField,
      createdByField,
      createdAtField,
      employeesField,
      linkedinField,
      customField,
      annualRecurringRevenueField,
      ...internalFields,
    ];
    const companyMetadata = createObjectMetadata({
      id: 'company-object',
      fields: companyFields,
      readableFields: companyFields,
      labelIdentifierFieldMetadataId: nameField.id,
    });
    const workspaceMemberNameField = createFieldMetadata({
      id: 'workspace-member-name',
      name: 'name',
      label: 'Name',
      isSystem: false,
      isUIEditable: true,
    });
    const workspaceMemberMetadata = createObjectMetadata({
      id: 'workspace-member-object',
      fields: [workspaceMemberNameField],
      labelIdentifierFieldMetadataId: workspaceMemberNameField.id,
    });
    const visibleRecordFields = [
      nameField,
      domainField,
      createdByField,
      accountOwnerField,
      createdAtField,
      employeesField,
      linkedinField,
      addressField,
      customField,
    ].map((fieldMetadataItem, position) => ({
      fieldMetadataItemId: fieldMetadataItem.id,
      id: `view-field-${position}`,
      isVisible: true,
      position,
      size: 150,
    }));
    const exportFieldMetadataItems = getSpreadsheetExportFieldMetadataItems({
      objectMetadataItem: companyMetadata,
      recordFields: visibleRecordFields,
    });
    const exportColumns = getSpreadsheetExportColumns(
      getSpreadsheetExportColumnDefinitions(exportFieldMetadataItems),
    );
    const importFields = [
      createImportField({
        key: 'id',
        fieldMetadataItemId: recordIdField.id,
        fieldMetadataType: FieldMetadataType.UUID,
      }),
      ...[nameField, employeesField, customField].map((fieldMetadataItem) =>
        createImportField({
          key: fieldMetadataItem.name,
          fieldMetadataItemId: fieldMetadataItem.id,
          fieldMetadataType: fieldMetadataItem.type,
          label: fieldMetadataItem.label,
        }),
      ),
      ...[domainField, linkedinField].flatMap((fieldMetadataItem) =>
        ['primaryLinkLabel', 'primaryLinkUrl', 'secondaryLinks'].map(
          (subFieldName) =>
            createImportField({
              fieldMetadataItemId: fieldMetadataItem.id,
              fieldMetadataType: fieldMetadataItem.type,
              isNestedField: true,
              isCompositeSubField: true,
              compositeSubFieldKey: subFieldName,
              key: getCompositeSubFieldKey(fieldMetadataItem, subFieldName),
            }),
        ),
      ),
      ...[
        'addressStreet1',
        'addressStreet2',
        'addressCity',
        'addressState',
        'addressCountry',
        'addressPostcode',
        'addressLat',
        'addressLng',
      ].map((subFieldName) =>
        createImportField({
          fieldMetadataItemId: addressField.id,
          fieldMetadataType: addressField.type,
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
        uniqueFieldMetadataItem: workspaceMemberNameField,
      }),
      createImportField({
        fieldMetadataItemId: accountOwnerField.id,
        fieldMetadataType: FieldMetadataType.RELATION,
        isNestedField: true,
        isRelationConnectField: true,
        key: 'id (accountOwner)',
        uniqueFieldMetadataItem: recordIdField,
      }),
    ];
    const definitions = getSpreadsheetImportHeaderDefinitions({
      fieldMetadataItems: exportFieldMetadataItems,
      objectMetadataItems: [companyMetadata, workspaceMemberMetadata],
      spreadsheetImportFields: importFields,
    });
    const expectedHeaders = definitions.map(({ header }) => header);
    const exportHeaders = exportColumns.map(getSpreadsheetExportHeader);

    expect(expectedHeaders).toEqual(exportHeaders);
    expect(expectedHeaders).toEqual(
      expect.arrayContaining([
        'Record ID',
        'Name',
        'Domain Name / Link URL',
        'City',
        'Account Owner',
        'ID of Account Owner',
        'Custom Field',
      ]),
    );
    expect(expectedHeaders).not.toEqual(
      expect.arrayContaining([
        'Last update',
        'Deleted at',
        'Amount',
        'Currency',
        'Position',
        'Updated by',
        'Search vector',
      ]),
    );

    const validateHeaders = (headers: string[], values = headers) =>
      validateSpreadsheetImportHeaders({
        data: [values],
        fieldKeys: new Set(importFields.map(({ key }) => key)),
        headerDefinitions: definitions,
        headerValues: headers,
      });

    expect(validateHeaders(expectedHeaders).missingHeaders).toEqual([]);
    expect(
      validateHeaders([...expectedHeaders].reverse()).missingHeaders,
    ).toEqual([]);
    expect(
      validateHeaders(
        expectedHeaders,
        expectedHeaders.map(() => ''),
      ).errors,
    ).toEqual([]);
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
        expectedHeaders.filter((header) => header !== 'Domain Name / Link URL'),
      ).missingHeaders,
    ).toEqual(['Domain Name / Link URL']);
    expect(
      validateHeaders(expectedHeaders.filter((header) => header !== 'City'))
        .missingHeaders,
    ).toEqual(['City']);
  });
});
