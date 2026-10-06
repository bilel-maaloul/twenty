import { getLinksVariant } from '@/object-record/spreadsheet-import/utils/getLinksVariant';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { COMPOSITE_FIELD_SUB_FIELD_LABELS } from '@/settings/data-model/constants/CompositeFieldSubFieldLabel';
import { SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsCompositeFieldTypeConfigs';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportDuplicateGroup,
  type SpreadsheetImportTableHook,
  type SpreadsheetImportFieldDecision,
} from '@/spreadsheet-import/types';
import { isNonEmptyString } from '@sniptt/guards';
import { type FieldLinksVariant, FieldMetadataType } from 'twenty-shared/types';
import {
  getUniqueConstraintsFields,
  isDefined,
  getLinkUrlNormalizer,
} from 'twenty-shared/utils';
import { getSpreadsheetImportDuplicateGroupId } from '@/spreadsheet-import/utils/spreadsheetImportDuplicateResolution';

type Column = {
  columnName: string;
  label: string;
  fieldType: FieldMetadataType;
  linksVariant?: FieldLinksVariant;
};

type UniqueConstraint = {
  columns: Column[];
};

export const spreadsheetImportGetUnicityTableHook = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  spreadsheetImportFields: ReadonlyArray<{ key: string }> = [],
) => {
  const uniqueConstraintsFields = getUniqueConstraintsFields<
    FieldMetadataItem,
    EnrichedObjectMetadataItem
  >(objectMetadataItem);

  const uniqueConstraints: UniqueConstraint[] = uniqueConstraintsFields.map(
    (uniqueConstraintFields) => ({
      columns: uniqueConstraintFields.flatMap((field) => {
        if (isCompositeFieldType(field.type)) {
          const compositeTypeFieldConfig =
            SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[field.type];

          const uniqueSubFields = compositeTypeFieldConfig.subFields.filter(
            (subField) => subField.isIncludedInUniqueConstraint,
          );

          return uniqueSubFields.map((subField) => ({
            columnName: getCompositeSubFieldKey(field, subField.subFieldName),
            label: `${subField.subFieldLabel} (${field.label})`,
            fieldType: field.type,
            linksVariant: getLinksVariant(field),
          }));
        }

        return [
          {
            columnName: field.name,
            label: field.label,
            fieldType: field.type,
            linksVariant: undefined,
          },
        ];
      }),
    }),
  );
  const tableHook: SpreadsheetImportTableHook = (table) => {
    table.forEach((row) => {
      delete row.__duplicateInFile;
      delete row.__duplicateInFileGroups;
      delete row.__duplicateInFileRowNumber;
    });

    const duplicateRowIndices = new Set<number>();
    const duplicateGroupsByRowIndex = new Map<
      number,
      SpreadsheetImportDuplicateGroup[]
    >();
    const labelIdentifierField = objectMetadataItem.fields.find(
      (field) => field.id === objectMetadataItem.labelIdentifierFieldMetadataId,
    );

    const addDuplicateGroup = (
      rowIndices: number[],
      group: Omit<SpreadsheetImportDuplicateGroup, 'id'>,
    ) => {
      const duplicateGroup = {
        ...group,
        id: getSpreadsheetImportDuplicateGroupId(group),
      } satisfies SpreadsheetImportDuplicateGroup;

      rowIndices.forEach((rowIndex) => {
        const rowGroup = duplicateGroupsByRowIndex.get(rowIndex) ?? [];

        duplicateGroupsByRowIndex.set(rowIndex, [...rowGroup, duplicateGroup]);
      });
    };
    const getDuplicateGroupRows = (rowIndices: number[]) =>
      rowIndices.map((rowIndex) => {
        const rowLabel = labelIdentifierField
          ? table[rowIndex][labelIdentifierField.name]?.toString().trim()
          : undefined;

        return {
          rowNumber: rowIndex + 2,
          ...(isNonEmptyString(rowLabel) ? { label: rowLabel } : {}),
        };
      });

    for (const uniqueConstraint of uniqueConstraints) {
      const rowIndicesByUniqueValue = new Map<string, number[]>();

      table.forEach((row, index) => {
        const uniqueValue = getUniqueValues(row, uniqueConstraint.columns);

        if (!isNonEmptyString(uniqueValue)) {
          return;
        }

        const matchingRowIndices =
          rowIndicesByUniqueValue.get(uniqueValue) ?? [];

        rowIndicesByUniqueValue.set(uniqueValue, [
          ...matchingRowIndices,
          index,
        ]);
      });

      rowIndicesByUniqueValue.forEach((matchingRowIndices) => {
        if (matchingRowIndices.length < 2) {
          return;
        }

        const groupFields = uniqueConstraint.columns.map((column) => ({
          label: column.label,
          value:
            getNormalizedUniqueValue(table[matchingRowIndices[0]], column) ??
            '',
        }));

        matchingRowIndices.forEach((duplicateRowIndex) => {
          duplicateRowIndices.add(duplicateRowIndex);
        });
        addDuplicateGroup(matchingRowIndices, {
          kind: 'unique-constraint',
          fields: groupFields,
          rows: getDuplicateGroupRows(matchingRowIndices),
        });
      });
    }

    const rowIndicesByContent = new Map<string, number[]>();

    table.forEach((row, index) => {
      const rowEntries = Object.entries(row)
        .filter(
          ([fieldName, value]) =>
            !fieldName.startsWith('__') &&
            !isIncomingFieldIgnored(row, fieldName, spreadsheetImportFields) &&
            isDefined(value) &&
            value !== '',
        )
        .sort(([fieldNameA], [fieldNameB]) =>
          fieldNameA.localeCompare(fieldNameB),
        );

      if (rowEntries.length === 0) {
        return;
      }

      const rowContent = JSON.stringify(rowEntries);
      const matchingRowIndices = rowIndicesByContent.get(rowContent) ?? [];

      rowIndicesByContent.set(rowContent, [...matchingRowIndices, index]);
    });

    rowIndicesByContent.forEach((matchingRowIndices) => {
      if (matchingRowIndices.length < 2) {
        return;
      }

      const groupFields = [
        {
          label: 'Entire row',
          value: '',
        },
      ];

      matchingRowIndices.forEach((duplicateRowIndex) => {
        duplicateRowIndices.add(duplicateRowIndex);
      });
      addDuplicateGroup(matchingRowIndices, {
        kind: 'exact-row',
        fields: groupFields,
        rows: getDuplicateGroupRows(matchingRowIndices),
      });
    });

    duplicateRowIndices.forEach((duplicateIndex) => {
      table[duplicateIndex].__duplicateInFile = true;
      table[duplicateIndex].__duplicateInFileGroups = JSON.stringify(
        duplicateGroupsByRowIndex.get(duplicateIndex) ?? [],
      );
      table[duplicateIndex].__duplicateInFileRowNumber = String(
        duplicateIndex + 2,
      );
    });

    return table;
  };

  return tableHook;
};

const getUniqueValues = (
  row: ImportedStructuredRow,
  uniqueConstraint: Column[],
) => {
  if (
    uniqueConstraint.some((column) =>
      isIncomingFieldIgnored(row, column.columnName, []),
    )
  ) {
    return undefined;
  }

  const normalizedValues = uniqueConstraint.map((column) =>
    getNormalizedUniqueValue(row, column),
  );

  const normalizedNonEmptyValues = normalizedValues.map((value) => value ?? '');

  if (normalizedNonEmptyValues.some((value) => value === '')) {
    return undefined;
  }

  return JSON.stringify(normalizedNonEmptyValues);
};

const isIncomingFieldIgnored = (
  row: ImportedStructuredRow,
  fieldKey: string,
  fields: ReadonlyArray<{ key: string }>,
) => {
  if (typeof row.__fieldDecisions !== 'string') {
    return false;
  }

  let decisions: Record<string, SpreadsheetImportFieldDecision>;

  try {
    decisions = JSON.parse(row.__fieldDecisions) as Record<
      string,
      SpreadsheetImportFieldDecision
    >;
  } catch {
    return false;
  }

  const field = fields.find(({ key }) => key === fieldKey);

  return (
    decisions[fieldKey] === 'IGNORE_INCOMING_FIELD' ||
    (isDefined(field) && decisions[field.key] === 'IGNORE_INCOMING_FIELD')
  );
};

const getNormalizedUniqueValue = (
  row: ImportedStructuredRow,
  { columnName, fieldType, linksVariant }: Column,
) => {
  const value = row?.[columnName]?.toString().trim();

  // This must match the transformer used when a Link URL is saved.
  if (
    fieldType === FieldMetadataType.LINKS &&
    columnName.includes(
      COMPOSITE_FIELD_SUB_FIELD_LABELS[FieldMetadataType.LINKS].primaryLinkUrl,
    )
  ) {
    return getLinkUrlNormalizer(linksVariant)(value ?? '');
  }

  return fieldType === FieldMetadataType.EMAILS ? value?.toLowerCase() : value;
};
