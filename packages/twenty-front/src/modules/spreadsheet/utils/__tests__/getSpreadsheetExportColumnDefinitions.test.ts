import {
  getSpreadsheetExportColumnDefinitions,
  type SpreadsheetExportFieldMetadata,
} from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { i18n } from '@lingui/core';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';
import { messages as frenchMessages } from '~/locales/generated/fr-FR';

const field = (
  metadata: Partial<SpreadsheetExportFieldMetadata> &
    Pick<SpreadsheetExportFieldMetadata, 'id' | 'name' | 'label' | 'type'>,
): SpreadsheetExportFieldMetadata => metadata;

describe('getSpreadsheetExportColumnDefinitions', () => {
  it('uses custom metadata labels for simple and compound fields', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'vehicle-registration-number',
        name: 'registrationNumber',
        label: 'Registration Number',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'person-name',
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.FULL_NAME,
      }),
      field({
        id: 'office-address',
        name: 'officeAddress',
        label: 'Office Address',
        type: FieldMetadataType.ADDRESS,
      }),
      field({
        id: 'purchase-price',
        name: 'purchasePrice',
        label: 'Purchase Price',
        type: FieldMetadataType.CURRENCY,
      }),
      field({
        id: 'website',
        name: 'website',
        label: 'Website',
        type: FieldMetadataType.LINKS,
      }),
      field({
        id: 'contact-email',
        name: 'contactEmail',
        label: 'Contact Email',
        type: FieldMetadataType.EMAILS,
      }),
      field({
        id: 'contact-phone',
        name: 'contactPhone',
        label: 'Contact Phone',
        type: FieldMetadataType.PHONES,
      }),
    ]);

    expect(columns.map((column) => column.header)).toEqual([
      'Registration Number',
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
      'Primary Email',
      'Additional Emails',
      'Phone Number',
      'Country Code',
      'Calling Code',
      'Additional Phones',
    ]);
  });

  it('uses the same metadata contract for standard and custom object fields', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'company-domain',
        name: 'domain',
        label: 'Domain',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'people-name',
        name: 'name',
        label: 'Name',
        type: FieldMetadataType.FULL_NAME,
      }),
      field({
        id: 'opportunity-amount',
        name: 'amount',
        label: 'Deal value',
        type: FieldMetadataType.CURRENCY,
      }),
      field({
        id: 'custom-object-code',
        name: 'vehicleRegistration',
        label: 'Vehicle registration',
        type: FieldMetadataType.TEXT,
      }),
    ]);

    expect(columns.map((column) => column.header)).toEqual([
      'Domain',
      'First Name',
      'Last Name',
      'Amount',
      'Currency',
      'Vehicle registration',
    ]);
  });

  it('keeps relation values and stable relation IDs as distinct columns', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'company-field',
        name: 'company',
        label: 'Company',
        type: FieldMetadataType.RELATION,
        relation: { type: RelationType.MANY_TO_ONE },
      }),
    ]);

    expect(columns).toMatchObject([
      {
        field: 'company',
        header: 'Company',
        fieldMetadataId: 'company-field',
      },
      {
        field: 'companyId',
        header: 'ID of Company',
        fieldMetadataId: 'company-field',
        isRelationId: true,
      },
    ]);
  });

  it('omits relations that cannot be represented by the existing export shape', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'companies-field',
        name: 'companies',
        label: 'Companies',
        type: FieldMetadataType.RELATION,
        relation: { type: RelationType.ONE_TO_MANY },
      }),
    ]);

    expect(columns).toEqual([]);
  });

  it('disambiguates duplicate labels deterministically', () => {
    const fields = [
      field({
        id: 'first-name',
        name: 'firstName',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'second-name',
        name: 'secondName',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      }),
    ];

    const firstResult = getSpreadsheetExportColumnDefinitions(fields);
    const secondResult = getSpreadsheetExportColumnDefinitions(fields);

    expect(firstResult.map((column) => column.header)).toEqual([
      'Name',
      'Name (2)',
    ]);
    expect(secondResult).toEqual(firstResult);
  });

  it('qualifies duplicate link component labels only when required', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'company-website',
        name: 'website',
        label: 'Website',
        type: FieldMetadataType.LINKS,
      }),
      field({
        id: 'social-website',
        name: 'socialWebsite',
        label: 'Social Website',
        type: FieldMetadataType.LINKS,
      }),
    ]);

    expect(columns.map((column) => column.header)).toEqual([
      'Website / Link label',
      'Website / Link URL',
      'Website / Additional Links',
      'Social Website / Link label',
      'Social Website / Link URL',
      'Social Website / Additional Links',
    ]);
  });

  it('keeps compound header qualification stable for exported subsets', () => {
    const fields = [
      field({
        id: 'company-website',
        name: 'website',
        label: 'Website',
        type: FieldMetadataType.LINKS,
      }),
      field({
        id: 'social-website',
        name: 'socialWebsite',
        label: 'Social Website',
        type: FieldMetadataType.LINKS,
      }),
    ];

    const subsetColumns = getSpreadsheetExportColumnDefinitions([fields[1]], {
      headerDisambiguationFieldMetadataItems: fields,
    });

    expect(subsetColumns.map((column) => column.header)).toEqual([
      'Social Website / Link label',
      'Social Website / Link URL',
      'Social Website / Additional Links',
    ]);
  });

  it('keeps simple duplicate header suffixes stable for exported subsets', () => {
    const fields = [
      field({
        id: 'first-name',
        name: 'firstName',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'second-name',
        name: 'secondName',
        label: 'Name',
        type: FieldMetadataType.TEXT,
      }),
    ];

    const subsetColumns = getSpreadsheetExportColumnDefinitions([fields[1]], {
      headerDisambiguationFieldMetadataItems: fields,
    });

    expect(subsetColumns.map((column) => column.header)).toEqual(['Name (2)']);
  });

  it('localizes component labels and preserves non-ASCII metadata labels', () => {
    const columns = getSpreadsheetExportColumnDefinitions(
      [
        field({
          id: 'owner-field',
          name: 'owner',
          label: 'Propriétaire',
          type: FieldMetadataType.TEXT,
        }),
      ],
      { includeRecordId: true },
    );

    expect(columns.map((column) => column.header)).toEqual([
      'Record ID',
      'Propriétaire',
    ]);
    expect(columns[0]).toMatchObject({ field: 'id', isRecordId: true });
  });

  it('does not rewrite valid non-ASCII custom field labels', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'created-by-field',
        name: 'createdBy',
        label: 'Créé par — مرحبا 你好',
        type: FieldMetadataType.TEXT,
      }),
    ]);

    expect(columns[0].header).toBe('Créé par — مرحبا 你好');
  });

  it('uses repaired localized labels for standard compound components', () => {
    const previousLocale = i18n.locale;
    i18n.load('fr-FR', frenchMessages);
    i18n.activate('fr-FR');

    try {
      const columns = getSpreadsheetExportColumnDefinitions(
        [
          field({
            id: 'address-field',
            name: 'address',
            label: 'Adresse',
            type: FieldMetadataType.ADDRESS,
          }),
        ],
        { includeRecordId: true },
      );

      expect(columns.map((column) => column.header)).toEqual([
        "ID de l'enregistrement",
        'Adresse',
        'Adresse 2',
        'Ville',
        '\u00c9tat',
        'Pays',
        'Code postal',
        'Latitude',
        'Longitude',
      ]);
    } finally {
      if (previousLocale) {
        i18n.activate(previousLocale);
      }
    }
  });

  it('keeps link headers concise and localized for arbitrary field labels', () => {
    const previousLocale = i18n.locale;
    i18n.load('fr-FR', frenchMessages);
    i18n.activate('fr-FR');

    try {
      const columns = getSpreadsheetExportColumnDefinitions([
        field({
          id: 'partner-site',
          name: 'partnerSite',
          label: 'Site partenaire',
          type: FieldMetadataType.LINKS,
        }),
      ]);

      expect(columns.map((column) => column.header)).toEqual([
        'Libellé du lien',
        'URL du lien',
        'Lien',
      ]);
      expect(columns.map((column) => column.header)).not.toContain(
        'Additional Links',
      );
    } finally {
      if (previousLocale) {
        i18n.activate(previousLocale);
      }
    }
  });

  it('uses localized fallbacks for compound components missing a direct catalog entry', () => {
    const previousLocale = i18n.locale;
    i18n.load('fr-FR', frenchMessages);
    i18n.activate('fr-FR');

    try {
      const columns = getSpreadsheetExportColumnDefinitions([
        field({
          id: 'contact-emails',
          name: 'emails',
          label: 'Emails',
          type: FieldMetadataType.EMAILS,
        }),
        field({
          id: 'contact-phones',
          name: 'phones',
          label: 'Phones',
          type: FieldMetadataType.PHONES,
        }),
      ]);

      expect(columns.map((column) => column.header)).toEqual([
        'Email principal',
        'Courriels',
        'Numéro de téléphone',
        'Code',
        'Indicatif',
        'Téléphone',
      ]);
    } finally {
      if (previousLocale) {
        i18n.activate(previousLocale);
      }
    }
  });

  it('uses the localized relation template for relation IDs', () => {
    const previousLocale = i18n.locale;
    i18n.load('fr-FR', frenchMessages);
    i18n.activate('fr-FR');

    try {
      const columns = getSpreadsheetExportColumnDefinitions([
        field({
          id: 'account-owner-field',
          name: 'accountOwner',
          label: 'Propriétaire du compte',
          type: FieldMetadataType.RELATION,
          relation: { type: RelationType.MANY_TO_ONE },
        }),
      ]);

      expect(columns.map((column) => column.header)).toEqual([
        'Propriétaire du compte',
        'ID de Propriétaire du compte',
      ]);
    } finally {
      if (previousLocale) {
        i18n.activate(previousLocale);
      }
    }
  });

  it('qualifies only colliding compound headers and keeps all components', () => {
    const columns = getSpreadsheetExportColumnDefinitions([
      field({
        id: 'billing-address',
        name: 'billingAddress',
        label: 'Billing Address',
        type: FieldMetadataType.ADDRESS,
      }),
      field({
        id: 'shipping-address',
        name: 'shippingAddress',
        label: 'Shipping Address',
        type: FieldMetadataType.ADDRESS,
      }),
    ]);

    expect(columns.map((column) => column.header)).toEqual([
      'Billing Address / Address',
      'Billing Address / Address 2',
      'Billing Address / City',
      'Billing Address / State',
      'Billing Address / Country',
      'Billing Address / Postcode',
      'Billing Address / Latitude',
      'Billing Address / Longitude',
      'Shipping Address / Address',
      'Shipping Address / Address 2',
      'Shipping Address / City',
      'Shipping Address / State',
      'Shipping Address / Country',
      'Shipping Address / Postcode',
      'Shipping Address / Latitude',
      'Shipping Address / Longitude',
    ]);
  });

  it('keeps duplicate custom labels deterministic after compound expansion', () => {
    const fields = [
      field({
        id: 'first-custom-label',
        name: 'firstCustomLabel',
        label: 'Custom label',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'second-custom-label',
        name: 'secondCustomLabel',
        label: 'Custom label',
        type: FieldMetadataType.TEXT,
      }),
      field({
        id: 'third-custom-label',
        name: 'thirdCustomLabel',
        label: 'Custom label',
        type: FieldMetadataType.TEXT,
      }),
    ];

    expect(
      getSpreadsheetExportColumnDefinitions(fields).map(
        (column) => column.header,
      ),
    ).toEqual(['Custom label', 'Custom label (2)', 'Custom label (3)']);
  });
});
