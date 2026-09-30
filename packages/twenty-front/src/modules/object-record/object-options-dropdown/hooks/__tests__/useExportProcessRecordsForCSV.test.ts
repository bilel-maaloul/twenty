import { useExportProcessRecordsForCSV } from '@/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { FieldMetadataType } from '~/generated-metadata/graphql';

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: jest.fn(() => ({
    objectMetadataItem: {
      fields: [
        { type: FieldMetadataType.CURRENCY, name: 'price' },
        { type: FieldMetadataType.TEXT, name: 'name' },
        {
          type: FieldMetadataType.SELECT,
          name: 'status',
          options: [{ value: 'IN_PROGRESS', label: 'In progress' }],
        },
        { type: FieldMetadataType.MULTI_SELECT, name: 'tags' },
        { type: FieldMetadataType.ARRAY, name: 'skills' },
        { type: FieldMetadataType.LINKS, name: 'links' },
        { type: FieldMetadataType.PHONES, name: 'phones' },
        { type: FieldMetadataType.EMAILS, name: 'emails' },
        { type: FieldMetadataType.ACTOR, name: 'createdBy' },
        { type: FieldMetadataType.DATE_TIME, name: 'updatedAt' },
        {
          type: FieldMetadataType.RELATION,
          name: 'company',
          relation: {
            targetObjectMetadata: { id: 'company-metadata-id' },
          },
        },
      ],
    },
  })),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(() => ({ objectMetadataItems: [] })),
}));

describe('useExportProcessRecordsForCSV', () => {
  it('processes records with currency fields correctly', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        price: { amountMicros: 123456, currencyCode: 'USD' },
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        price: { amountMicros: 789012, currencyCode: 'EUR' },
        name: 'Item 2',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        price: { amountMicros: 0.123456, currencyCode: 'USD' },
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        price: { amountMicros: 0.789012, currencyCode: 'EUR' },
        name: 'Item 2',
      },
    ]);
  });

  it('formats multi-select and array values as readable lines', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: ['TAG1', 'TAG2'],
        skills: ['skill1', 'skill2', 'skill3'],
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        tags: ['TAG3'],
        skills: ['skill4'],
        name: 'Item 2',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: 'TAG1\nTAG2',
        skills: 'skill1\nskill2\nskill3',
        name: 'Item 1',
      },
      {
        __typename: 'ObjectRecord',
        id: '2',
        tags: 'TAG3',
        skills: 'skill4',
        name: 'Item 2',
      },
    ]);
  });

  it('exports select option labels instead of internal option values', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );
    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport([
        {
          __typename: 'ObjectRecord',
          id: '1',
          name: 'Item 1',
          status: 'IN_PROGRESS',
        },
      ]);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        name: 'Item 1',
        status: 'In progress',
      },
    ]);
  });

  it('formats empty multi-select and array values as empty cells', () => {
    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );

    const records = [
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: [],
        skills: [],
        name: 'Item 1',
      },
    ];

    let processedRecords;

    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        __typename: 'ObjectRecord',
        id: '1',
        tags: '',
        skills: '',
        name: 'Item 1',
      },
    ]);
  });

  it('formats compound values and relations without JSON implementation details', () => {
    jest.mocked(useObjectMetadataItems).mockReturnValue({
      objectMetadataItems: [
        {
          id: 'company-metadata-id',
          fields: [
            {
              id: 'company-name-field',
              name: 'name',
              label: 'Name',
              type: FieldMetadataType.TEXT,
            },
          ],
          labelIdentifierFieldMetadataId: 'company-name-field',
        } as EnrichedObjectMetadataItem,
      ],
    });

    const { result } = renderHook(() =>
      useExportProcessRecordsForCSV('someObject'),
    );
    const records = [
      {
        __typename: 'ObjectRecord',
        id: 'record-id',
        links: {
          primaryLinkUrl: 'https://example.com',
          primaryLinkLabel: 'Example',
          secondaryLinks: [
            { label: 'Help: desk', url: 'https://example.com/help' },
          ],
        },
        phones: {
          additionalPhones: [
            {
              number: '+1 416 555 0100',
              callingCode: '+1',
              countryCode: 'CA',
            },
          ],
        },
        emails: {
          primaryEmail: 'person@example.com',
          additionalEmails: ['work@example.com', 'other@example.com'],
        },
        createdBy: {
          source: 'MANUAL',
          name: 'Jane Doe',
          context: { provider: 'GOOGLE' },
        },
        updatedAt: '2025-02-03T04:05:06.123Z',
        company: { id: 'company-id', name: 'Acme Corporation' },
        companyId: 'company-id',
      },
    ];

    let processedRecords;
    act(() => {
      processedRecords = result.current.processRecordsForCSVExport(records);
    });

    expect(processedRecords).toEqual([
      {
        ...records[0],
        links: {
          primaryLinkUrl: 'https://example.com',
          primaryLinkLabel: 'Example',
          secondaryLinks: 'Help\\: desk: https://example.com/help',
        },
        phones: {
          additionalPhones: '+1 416 555 0100 (CA)',
        },
        emails: {
          primaryEmail: 'person@example.com',
          additionalEmails: 'work@example.com\nother@example.com',
        },
        createdBy: 'Jane Doe',
        updatedAt: '2025-02-03 04:05:06.123 UTC',
        company: 'Acme Corporation',
        companyId: 'company-id',
      },
    ]);
  });
});
