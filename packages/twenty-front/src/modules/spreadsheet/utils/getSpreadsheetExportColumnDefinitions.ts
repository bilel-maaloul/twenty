import { i18n } from '@lingui/core';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { COMPOSITE_FIELD_SUB_FIELD_LABELS } from '@/settings/data-model/constants/CompositeFieldSubFieldLabel';
import { generateMessageId } from 'twenty-shared/i18n';
import { isNonEmptyString } from '@sniptt/guards';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

export type SpreadsheetExportFieldMetadata = Pick<
  FieldMetadataItem,
  'id' | 'name' | 'label' | 'type'
> & {
  relation?: Pick<NonNullable<FieldMetadataItem['relation']>, 'type'> | null;
};

export type SpreadsheetExportColumnDefinition = {
  field: string;
  header: string;
  parentHeader?: string;
  fieldMetadataId?: string;
  fieldMetadataName: string;
  fieldMetadataType: FieldMetadataType;
  relationType?: RelationType;
  subFieldName?: string;
  isRecordId?: boolean;
  isRelationId?: boolean;
};

export type GetSpreadsheetExportColumnDefinitionsOptions = {
  includeRecordId?: boolean;
  headerDisambiguationFieldMetadataItems?: SpreadsheetExportFieldMetadata[];
};

const MOJIBAKE_MARKER_CODE_POINTS = new Set([0xc3, 0xc2, 0xe2]);

const countMojibakeMarkers = (value: string): number =>
  [...value].filter((character) =>
    MOJIBAKE_MARKER_CODE_POINTS.has(character.codePointAt(0) ?? 0),
  ).length;

const getWindows1252Byte = (character: string): number | undefined => {
  const codePoint = character.codePointAt(0);

  if (codePoint === undefined) {
    return undefined;
  }

  if (codePoint <= 0xff) {
    return codePoint;
  }

  switch (codePoint) {
    case 0x0152:
      return 0x8c;
    case 0x0153:
      return 0x9c;
    case 0x0160:
      return 0x8a;
    case 0x0161:
      return 0x9a;
    case 0x0178:
      return 0x9f;
    case 0x017d:
      return 0x8e;
    case 0x017e:
      return 0x9e;
    case 0x0192:
      return 0x83;
    case 0x02c6:
      return 0x88;
    case 0x02dc:
      return 0x98;
    case 0x2018:
      return 0x91;
    case 0x2019:
      return 0x92;
    case 0x201a:
      return 0x82;
    case 0x201c:
      return 0x93;
    case 0x201d:
      return 0x94;
    case 0x201e:
      return 0x84;
    case 0x2020:
      return 0x86;
    case 0x2021:
      return 0x87;
    case 0x2022:
      return 0x95;
    case 0x2026:
      return 0x85;
    case 0x2030:
      return 0x89;
    case 0x2039:
      return 0x8b;
    case 0x203a:
      return 0x9b;
    case 0x20ac:
      return 0x80;
    case 0x2122:
      return 0x99;
    default:
      return undefined;
  }
};

const decodeMojibakeAsUtf8 = (value: string): string | undefined => {
  const bytes = new Uint8Array(value.length);
  let byteIndex = 0;

  for (const character of value) {
    const byte = getWindows1252Byte(character);

    if (byte === undefined) {
      return undefined;
    }

    bytes[byteIndex] = byte;
    byteIndex += 1;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, byteIndex),
    );
  } catch {
    return undefined;
  }
};

const repairUtf8Mojibake = (value: string): string => {
  let repairedValue = value;

  for (let attempt = 0; attempt < 3; attempt++) {
    const markerCount = countMojibakeMarkers(repairedValue);

    if (markerCount === 0) {
      break;
    }

    const candidate = decodeMojibakeAsUtf8(repairedValue);
    const candidateMarkerCount = candidate
      ? countMojibakeMarkers(candidate)
      : markerCount;

    if (!candidate || candidateMarkerCount >= markerCount) {
      break;
    }

    repairedValue = candidate;
  }

  return repairedValue;
};

const localizeExportLabel = (label: string): string =>
  repairUtf8Mojibake(i18n._({ id: generateMessageId(label), message: label }));

const localizeExportLabelWithFallback = (
  label: string,
  fallbackLabel: string,
): string => {
  const localizedLabel = localizeExportLabel(label);

  if (
    localizedLabel !== label ||
    !isNonEmptyString(i18n.locale) ||
    i18n.locale.startsWith('en')
  ) {
    return localizedLabel;
  }

  return localizeExportLabel(fallbackLabel);
};

const humanizeFieldName = (fieldName: string): string => {
  const humanizedFieldName = fieldName
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!isNonEmptyString(humanizedFieldName)) {
    return fieldName;
  }

  return (
    humanizedFieldName.charAt(0).toUpperCase() + humanizedFieldName.slice(1)
  );
};

const getFieldLabel = (fieldMetadata: SpreadsheetExportFieldMetadata) =>
  isNonEmptyString(fieldMetadata.label)
    ? fieldMetadata.label
    : humanizeFieldName(fieldMetadata.name);

const getRelationIdHeader = (fieldLabel: string): string =>
  repairUtf8Mojibake(
    i18n._({
      id: generateMessageId('{aggregateLabel} of {fieldLabel}'),
      message: '{aggregateLabel} of {fieldLabel}',
      values: {
        aggregateLabel: localizeExportLabel('ID'),
        fieldLabel,
      },
    }),
  );

const EXPORT_LABEL_BY_FIELD_TYPE: Partial<
  Record<FieldMetadataType, Record<string, string>>
> = {
  [FieldMetadataType.ADDRESS]: {
    addressStreet1: 'Address 1',
    addressPostcode: 'Postcode',
  },
  [FieldMetadataType.LINKS]: {
    primaryLinkLabel: 'Link label',
    secondaryLinks: 'Additional Links',
  },
  [FieldMetadataType.EMAILS]: {
    additionalEmails: 'Additional Emails',
  },
  [FieldMetadataType.PHONES]: {
    primaryPhoneNumber: 'Phone Number',
    primaryPhoneCountryCode: 'Country Code',
    primaryPhoneCallingCode: 'Calling Code',
    additionalPhones: 'Additional Phones',
  },
};

const EXPORT_LABEL_FALLBACK_BY_FIELD_TYPE: Partial<
  Record<FieldMetadataType, Record<string, string>>
> = {
  [FieldMetadataType.LINKS]: {
    secondaryLinks: 'Link',
  },
  [FieldMetadataType.EMAILS]: {
    additionalEmails: 'Emails',
  },
  [FieldMetadataType.PHONES]: {
    primaryPhoneCountryCode: 'Code',
    additionalPhones: 'Phone',
  },
};

const getCompositeSubFieldLabel = ({
  fieldType,
  subFieldName,
  subFieldLabel,
}: {
  fieldType: FieldMetadataType;
  subFieldName: string;
  subFieldLabel: string;
}): string => {
  const sourceLabel =
    EXPORT_LABEL_BY_FIELD_TYPE[fieldType]?.[subFieldName] ?? subFieldLabel;
  const fallbackLabel =
    EXPORT_LABEL_FALLBACK_BY_FIELD_TYPE[fieldType]?.[subFieldName];
  const localizedLabel = fallbackLabel
    ? localizeExportLabelWithFallback(sourceLabel, fallbackLabel)
    : localizeExportLabel(sourceLabel);

  if (
    fieldType === FieldMetadataType.ADDRESS &&
    subFieldName === 'addressStreet1'
  ) {
    return localizedLabel.replace(/\s+1$/, '');
  }

  return localizedLabel;
};

export const getSpreadsheetExportRecordIdColumnDefinition =
  (): SpreadsheetExportColumnDefinition => ({
    field: 'id',
    header: localizeExportLabel('Record ID'),
    fieldMetadataName: 'id',
    fieldMetadataType: FieldMetadataType.UUID,
    isRecordId: true,
  });

const createSimpleFieldColumn = (
  fieldMetadata: SpreadsheetExportFieldMetadata,
): SpreadsheetExportColumnDefinition => ({
  field: fieldMetadata.name,
  header: getFieldLabel(fieldMetadata),
  fieldMetadataId: fieldMetadata.id,
  fieldMetadataName: fieldMetadata.name,
  fieldMetadataType: fieldMetadata.type,
});

const createRelationColumns = (
  fieldMetadata: SpreadsheetExportFieldMetadata,
): SpreadsheetExportColumnDefinition[] => {
  if (fieldMetadata.relation?.type !== RelationType.MANY_TO_ONE) {
    return [];
  }

  const fieldLabel = getFieldLabel(fieldMetadata);

  return [
    {
      field: fieldMetadata.name,
      header: fieldLabel,
      fieldMetadataId: fieldMetadata.id,
      fieldMetadataName: fieldMetadata.name,
      fieldMetadataType: fieldMetadata.type,
      relationType: fieldMetadata.relation.type,
    },
    {
      field: fieldMetadata.name + 'Id',
      header: getRelationIdHeader(fieldLabel),
      fieldMetadataId: fieldMetadata.id,
      fieldMetadataName: fieldMetadata.name,
      fieldMetadataType: FieldMetadataType.UUID,
      relationType: fieldMetadata.relation.type,
      subFieldName: 'id',
      isRelationId: true,
    },
  ];
};

const createCompositeFieldColumns = (
  fieldMetadata: SpreadsheetExportFieldMetadata,
): SpreadsheetExportColumnDefinition[] => {
  if (
    !isCompositeFieldType(fieldMetadata.type) ||
    fieldMetadata.type === FieldMetadataType.ACTOR
  ) {
    return [createSimpleFieldColumn(fieldMetadata)];
  }

  const fieldLabel = getFieldLabel(fieldMetadata);
  const subFieldLabels = COMPOSITE_FIELD_SUB_FIELD_LABELS[fieldMetadata.type];

  return Object.entries(subFieldLabels).map(
    ([subFieldName, subFieldLabel]) => ({
      field: fieldMetadata.name + '.' + subFieldName,
      header: getCompositeSubFieldLabel({
        fieldType: fieldMetadata.type,
        subFieldName,
        subFieldLabel,
      }),
      parentHeader: fieldLabel,
      fieldMetadataId: fieldMetadata.id,
      fieldMetadataName: fieldMetadata.name,
      fieldMetadataType: fieldMetadata.type,
      subFieldName,
    }),
  );
};

const createFieldColumns = (
  fieldMetadata: SpreadsheetExportFieldMetadata,
): SpreadsheetExportColumnDefinition[] => {
  if (fieldMetadata.type === FieldMetadataType.RELATION) {
    return createRelationColumns(fieldMetadata);
  }

  return createCompositeFieldColumns(fieldMetadata);
};

export const ensureSpreadsheetExportColumnHeadersUnique = (
  columns: SpreadsheetExportColumnDefinition[],
  headerDisambiguationColumns: SpreadsheetExportColumnDefinition[] = columns,
): SpreadsheetExportColumnDefinition[] => {
  const columnsByHeader = new Map<
    string,
    SpreadsheetExportColumnDefinition[]
  >();

  for (const column of headerDisambiguationColumns) {
    const columnsWithHeader = columnsByHeader.get(column.header) ?? [];
    columnsWithHeader.push(column);
    columnsByHeader.set(column.header, columnsWithHeader);
  }

  const usedHeaders = new Set<string>();
  const nextSuffixByHeader = new Map<string, number>();

  return columns.map((column) => {
    const columnsWithSameHeader = columnsByHeader.get(column.header) ?? [];
    const columnPositionInDisambiguationScope = columnsWithSameHeader.findIndex(
      (scopeColumn) => scopeColumn.field === column.field,
    );
    const isHeaderDuplicatedInDisambiguationScope =
      columnsWithSameHeader.length > 1;
    const baseHeader =
      column.parentHeader !== undefined &&
      isHeaderDuplicatedInDisambiguationScope
        ? column.parentHeader + ' / ' + column.header
        : column.header;
    let nextSuffix =
      column.parentHeader === undefined &&
      isHeaderDuplicatedInDisambiguationScope &&
      columnPositionInDisambiguationScope >= 0
        ? columnPositionInDisambiguationScope + 1
        : (nextSuffixByHeader.get(baseHeader) ?? 1);
    let header =
      nextSuffix === 1 ? baseHeader : baseHeader + ' (' + nextSuffix + ')';

    while (usedHeaders.has(header)) {
      nextSuffix += 1;
      header = baseHeader + ' (' + nextSuffix + ')';
    }

    nextSuffixByHeader.set(baseHeader, nextSuffix + 1);
    usedHeaders.add(header);

    return { ...column, header };
  });
};

export const getSpreadsheetExportColumnDefinitions = (
  fieldMetadataItems: SpreadsheetExportFieldMetadata[],
  options: GetSpreadsheetExportColumnDefinitionsOptions = {},
): SpreadsheetExportColumnDefinition[] => {
  const fieldColumns = fieldMetadataItems.flatMap(createFieldColumns);
  const headerDisambiguationColumns =
    options.headerDisambiguationFieldMetadataItems
      ? options.headerDisambiguationFieldMetadataItems.flatMap(
          createFieldColumns,
        )
      : fieldColumns;
  const columns = options.includeRecordId
    ? [getSpreadsheetExportRecordIdColumnDefinition(), ...fieldColumns]
    : fieldColumns;

  return ensureSpreadsheetExportColumnHeadersUnique(
    columns,
    headerDisambiguationColumns,
  );
};
