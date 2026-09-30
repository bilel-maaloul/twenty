import { getLinksVariant } from '@/object-record/spreadsheet-import/utils/getLinksVariant';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { COMPOSITE_FIELD_SUB_FIELD_LABELS } from '@/settings/data-model/constants/CompositeFieldSubFieldLabel';
import { SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsCompositeFieldTypeConfigs';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportTableHook,
} from '@/spreadsheet-import/types';
import { isNonEmptyString } from '@sniptt/guards';
import { type FieldLinksVariant, FieldMetadataType } from 'twenty-shared/types';
import {
  getUniqueConstraintsFields,
  isDefined,
  getLinkUrlNormalizer,
} from 'twenty-shared/utils';

type Column = {
  columnName: string;
  fieldType: FieldMetadataType;
  linksVariant?: FieldLinksVariant;
};

export const spreadsheetImportGetUnicityTableHook = (
  objectMetadataItem: EnrichedObjectMetadataItem,
) => {
  const uniqueConstraintsFields = getUniqueConstraintsFields<
    FieldMetadataItem,
    EnrichedObjectMetadataItem
  >(objectMetadataItem);

  const uniqueConstraintsWithColumnNames: Column[][] =
    uniqueConstraintsFields.map((uniqueConstraintFields) =>
      uniqueConstraintFields.flatMap((field) => {
        if (isCompositeFieldType(field.type)) {
          const compositeTypeFieldConfig =
            SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[field.type];

          const uniqueSubFields = compositeTypeFieldConfig.subFields.filter(
            (subField) => subField.isIncludedInUniqueConstraint,
          );

          return uniqueSubFields.map((subField) => ({
            columnName: getCompositeSubFieldKey(field, subField.subFieldName),
            fieldType: field.type,
            linksVariant: getLinksVariant(field),
          }));
        }

        return [
          {
            columnName: field.name,
            fieldType: field.type,
            linksVariant: undefined,
          },
        ];
      }),
    );
  const tableHook: SpreadsheetImportTableHook = (table, addError) => {
    for (const uniqueConstraint of uniqueConstraintsWithColumnNames) {
      const uniqueValues: Record<string, number> = {};
      const duplicateIndices: Set<number> = new Set();

      table.forEach((row, index) => {
        const uniqueValue = getUniqueValues(row, uniqueConstraint);

        if (!isNonEmptyString(uniqueValue)) {
          return;
        }

        if (isDefined(uniqueValues[uniqueValue])) {
          const originalIndex = uniqueValues[uniqueValue];
          duplicateIndices.add(originalIndex);
          duplicateIndices.add(index);
        } else {
          uniqueValues[uniqueValue] = index;
        }
      });

      duplicateIndices.forEach((duplicateIndex) => {
        uniqueConstraint.forEach(({ columnName }) => {
          addError(duplicateIndex, columnName, {
            message: `This ${columnName} value already exists in your import data`,
            level: 'error',
          });
        });
      });
    }

    const rowIndexByContent = new Map<string, number>();

    table.forEach((row, index) => {
      const rowEntries = Object.entries(row)
        .filter(([, value]) => isDefined(value) && value !== '')
        .sort(([fieldNameA], [fieldNameB]) =>
          fieldNameA.localeCompare(fieldNameB),
        );

      if (rowEntries.length === 0) {
        return;
      }

      const rowContent = JSON.stringify(rowEntries);
      const duplicateRowIndex = rowIndexByContent.get(rowContent);

      if (isDefined(duplicateRowIndex)) {
        const fieldName = rowEntries[0][0];
        const error = {
          message: 'This row duplicates another row in your import data',
          level: 'error' as const,
        };

        addError(duplicateRowIndex, fieldName, error);
        addError(index, fieldName, error);
        return;
      }

      rowIndexByContent.set(rowContent, index);
    });

    return table;
  };

  return tableHook;
};

const getUniqueValues = (
  row: ImportedStructuredRow,
  uniqueConstraint: Column[],
) => {
  return uniqueConstraint
    .map(({ columnName, fieldType, linksVariant }) => {
      // need to ensure the primary link url is processed before import as on server side
      if (
        fieldType === FieldMetadataType.LINKS &&
        columnName.includes(
          COMPOSITE_FIELD_SUB_FIELD_LABELS[FieldMetadataType.LINKS]
            .primaryLinkUrl,
        )
      ) {
        const rawPrimaryLinkUrl = row?.[columnName]?.toString().trim() || '';

        return getLinkUrlNormalizer(linksVariant)(rawPrimaryLinkUrl);
      }

      return row?.[columnName]?.toString().trim().toLowerCase();
    })
    .join('');
};
