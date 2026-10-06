import { FieldMetadataType } from 'twenty-shared/types';

import { compareImportRecordToExisting } from 'src/engine/api/common/common-query-runners/common-import-preflight-query-runner/compare-import-record.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

describe('compareImportRecordToExisting', () => {
  const fields = [
    {
      id: 'amount-id',
      universalIdentifier: 'amount-id',
      name: 'amount',
      type: FieldMetadataType.NUMBER,
      isNullable: true,
    },
    {
      id: 'full-name-id',
      universalIdentifier: 'full-name-id',
      name: 'name',
      type: FieldMetadataType.FULL_NAME,
    },
    {
      id: 'tags-id',
      universalIdentifier: 'tags-id',
      name: 'tags',
      type: FieldMetadataType.MULTI_SELECT,
    },
    {
      id: 'date-id',
      universalIdentifier: 'date-id',
      name: 'date',
      type: FieldMetadataType.DATE,
      isNullable: true,
    },
    {
      id: 'address-id',
      universalIdentifier: 'address-id',
      name: 'address',
      type: FieldMetadataType.ADDRESS,
      isNullable: true,
    },
    {
      id: 'currency-id',
      universalIdentifier: 'currency-id',
      name: 'currency',
      type: FieldMetadataType.CURRENCY,
      isNullable: true,
    },
    {
      id: 'rich-text-id',
      universalIdentifier: 'rich-text-id',
      name: 'description',
      type: FieldMetadataType.RICH_TEXT,
      isNullable: true,
    },
    {
      id: 'active-id',
      universalIdentifier: 'active-id',
      name: 'active',
      type: FieldMetadataType.BOOLEAN,
      isNullable: true,
    },
    {
      id: 'phones-id',
      universalIdentifier: 'phones-id',
      name: 'phones',
      type: FieldMetadataType.PHONES,
    },
    {
      id: 'emails-id',
      universalIdentifier: 'emails-id',
      name: 'emails',
      type: FieldMetadataType.EMAILS,
    },
    {
      id: 'links-id',
      universalIdentifier: 'links-id',
      name: 'links',
      type: FieldMetadataType.LINKS,
    },
  ] as unknown as OrmFlatFieldMetadata[];

  const flatObjectMetadata = {
    fieldIds: fields.map((field) => field.id),
  } as unknown as FlatObjectMetadata;

  const flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata> = {
    byUniversalIdentifier: Object.fromEntries(
      fields.map((field) => [field.universalIdentifier, field]),
    ),
    universalIdentifierById: Object.fromEntries(
      fields.map((field) => [field.id, field.universalIdentifier]),
    ),
    universalIdentifiersByApplicationId: {},
  };

  it('compares canonical values without treating omitted composite fields as changes', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {
        amount: null,
        name: { firstName: undefined },
        tags: ['b', 'a'],
        date: '2024-01-01',
      },
      existingRecord: {
        amount: 0,
        name: { firstName: 'Ada', lastName: 'Lovelace' },
        tags: ['a', 'b'],
        date: new Date('2024-01-01T00:00:00.000Z'),
      },
      flatObjectMetadata,
      flatFieldMetadataMaps,
    });

    expect(result).toEqual({
      changedFieldNames: ['amount'],
      uncomparableFieldNames: [],
      fieldDifferences: [],
    });
  });

  it('treats an empty mapped cell as a difference without proposing an implicit clear', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {},
      existingRecord: { amount: 40 },
      flatObjectMetadata,
      flatFieldMetadataMaps,
      sourceStates: [
        {
          fieldMetadataId: 'amount-id',
          subFieldPath: [],
          state: 'EMPTY',
        },
      ],
    });

    expect(result).toMatchObject({
      changedFieldNames: ['amount'],
      fieldDifferences: [
        {
          fieldMetadataId: 'amount-id',
          existingValue: 40,
          incomingValue: null,
          sourceState: 'EMPTY',
          clearAllowed: true,
          comparable: true,
        },
      ],
    });
  });

  it('does not classify empty incoming data as a difference when the existing value is empty', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {},
      existingRecord: { amount: null },
      flatObjectMetadata,
      flatFieldMetadataMaps,
      sourceStates: [
        {
          fieldMetadataId: 'amount-id',
          subFieldPath: [],
          state: 'EMPTY',
        },
      ],
    });

    expect(result.changedFieldNames).toEqual([]);
    expect(result.fieldDifferences).toEqual([]);
  });

  it('compares Address, Currency, Full name, and Rich text by supplied subfield path', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {
        name: { firstName: 'Ada' },
        address: { addressCity: 'Tunis' },
        currency: { amountMicros: 55000000 },
        description: { markdown: 'Updated description' },
      },
      existingRecord: {
        name: { firstName: 'Augusta', lastName: 'Lovelace' },
        address: { addressStreet1: 'Old street', addressCity: 'Tunis' },
        currency: { amountMicros: 40000000, currencyCode: 'TND' },
        description: { markdown: 'Old description', blocknote: 'old-block' },
      },
      flatObjectMetadata,
      flatFieldMetadataMaps,
      sourceStates: [
        {
          fieldMetadataId: 'full-name-id',
          subFieldPath: ['firstName'],
          state: 'VALUE',
        },
        {
          fieldMetadataId: 'full-name-id',
          subFieldPath: ['lastName'],
          state: 'EMPTY',
        },
        {
          fieldMetadataId: 'address-id',
          subFieldPath: ['addressStreet1'],
          state: 'EMPTY',
        },
        {
          fieldMetadataId: 'address-id',
          subFieldPath: ['addressCity'],
          state: 'VALUE',
        },
        {
          fieldMetadataId: 'currency-id',
          subFieldPath: ['amountMicros'],
          state: 'VALUE',
        },
        {
          fieldMetadataId: 'rich-text-id',
          subFieldPath: ['markdown'],
          state: 'VALUE',
        },
        {
          fieldMetadataId: 'rich-text-id',
          subFieldPath: ['blocknote'],
          state: 'EMPTY',
        },
      ],
    });

    expect(
      result.fieldDifferences.map(({ fieldName, subFieldPath }) => [
        fieldName,
        subFieldPath[0],
      ]),
    ).toEqual([
      ['name', 'firstName'],
      ['name', 'lastName'],
      ['address', 'addressStreet1'],
      ['currency', 'amountMicros'],
      ['description', 'markdown'],
      ['description', 'blocknote'],
    ]);
    expect(
      result.fieldDifferences.find(
        ({ fieldName, subFieldPath }) =>
          fieldName === 'description' && subFieldPath[0] === 'blocknote',
      )?.clearAllowed,
    ).toBe(false);
  });

  it('keeps an empty Boolean distinct from an explicit false value', () => {
    const emptyIncoming = compareImportRecordToExisting({
      incomingRecord: {},
      existingRecord: { active: true },
      flatObjectMetadata,
      flatFieldMetadataMaps,
      sourceStates: [
        {
          fieldMetadataId: 'active-id',
          subFieldPath: [],
          state: 'EMPTY',
        },
      ],
    });
    const explicitFalseIncoming = compareImportRecordToExisting({
      incomingRecord: { active: false },
      existingRecord: { active: true },
      flatObjectMetadata,
      flatFieldMetadataMaps,
      sourceStates: [
        {
          fieldMetadataId: 'active-id',
          subFieldPath: [],
          state: 'VALUE',
        },
      ],
    });

    expect(emptyIncoming.fieldDifferences[0]).toMatchObject({
      existingValue: true,
      sourceState: 'EMPTY',
      incomingValue: null,
    });
    expect(explicitFalseIncoming.fieldDifferences[0]).toMatchObject({
      existingValue: true,
      sourceState: 'VALUE',
      incomingValue: false,
    });
  });

  it('canonicalizes serialized compound values without inventing phone differences', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {
        phones: {
          additionalPhones:
            '[{"countryCode":"TN","callingCode":"+216","number":"73422376"}]',
        },
        emails: {
          additionalEmails:
            '[{"email":"ada@example.com","primaryEmail":false}]',
        },
        links: {
          secondaryLinks: '[{"url":"https://example.com","label":"Site"}]',
        },
      },
      existingRecord: {
        phones: {
          additionalPhones: [
            { number: '73422376', callingCode: '+216', countryCode: 'TN' },
          ],
        },
        emails: {
          additionalEmails: [{ primaryEmail: false, email: 'ada@example.com' }],
        },
        links: {
          secondaryLinks: [{ label: 'Site', url: 'https://example.com' }],
        },
      },
      flatObjectMetadata,
      flatFieldMetadataMaps,
    });

    expect(result.changedFieldNames).toEqual([]);
    expect(result.uncomparableFieldNames).toEqual([]);
  });

  it('still detects genuinely different phone values', () => {
    const result = compareImportRecordToExisting({
      incomingRecord: {
        phones: {
          additionalPhones:
            '[{"number":"111","callingCode":"+216","countryCode":"TN"}]',
        },
      },
      existingRecord: {
        phones: {
          additionalPhones: [
            { number: '222', callingCode: '+216', countryCode: 'TN' },
          ],
        },
      },
      flatObjectMetadata,
      flatFieldMetadataMaps,
    });

    expect(result.changedFieldNames).toEqual(['phones']);
  });
});
