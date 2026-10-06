import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { cleanZWJFromImportedValue } from '@/spreadsheet-import/utils/cleanZWJFromImportedValue';
import { type SpreadsheetImportFields } from '@/spreadsheet-import/types/SpreadsheetImportFields';
import { type SpreadsheetImportHeaderDefinition } from '@/spreadsheet-import/types/SpreadsheetImportHeaderDefinition';
import {
  getSpreadsheetExportColumns,
  getSpreadsheetExportHeader,
} from '@/spreadsheet/utils/getSpreadsheetExportData';
import {
  getSpreadsheetExportColumnDefinitions,
  type SpreadsheetExportColumnDefinition,
} from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const getFieldForExportColumn = ({
  column,
  fieldMetadataItems,
  objectMetadataItems,
  spreadsheetImportFields,
}: {
  column: SpreadsheetExportColumnDefinition;
  fieldMetadataItems: FieldMetadataItem[];
  objectMetadataItems: EnrichedObjectMetadataItem[];
  spreadsheetImportFields: SpreadsheetImportFields;
}) => {
  if (column.isRecordId) {
    return spreadsheetImportFields.find(
      (field) => field.key === 'id' && !field.isNestedField,
    );
  }

  if (column.fieldMetadataId === undefined) {
    return undefined;
  }

  if (column.isRelationId) {
    return spreadsheetImportFields.find(
      (field) =>
        field.fieldMetadataItemId === column.fieldMetadataId &&
        field.isRelationConnectField === true &&
        field.uniqueFieldMetadataItem?.name === 'id',
    );
  }

  const fieldMetadataItem = fieldMetadataItems.find(
    (field) => field.id === column.fieldMetadataId,
  );

  if (fieldMetadataItem?.isUIEditable === false) {
    return undefined;
  }

  if (fieldMetadataItem?.type === FieldMetadataType.RELATION) {
    const targetObjectMetadataItem = objectMetadataItems.find(
      (objectMetadataItem) =>
        objectMetadataItem.id ===
        fieldMetadataItem.relation?.targetObjectMetadata.id,
    );
    const labelIdentifierFieldMetadataItem = targetObjectMetadataItem
      ? getLabelIdentifierFieldMetadataItem(targetObjectMetadataItem)
      : undefined;

    if (
      !labelIdentifierFieldMetadataItem ||
      isCompositeFieldType(labelIdentifierFieldMetadataItem.type)
    ) {
      return undefined;
    }

    return spreadsheetImportFields.find(
      (field) =>
        field.fieldMetadataItemId === column.fieldMetadataId &&
        field.isRelationConnectField === true &&
        field.uniqueFieldMetadataItem?.id ===
          labelIdentifierFieldMetadataItem.id,
    );
  }

  if (column.subFieldName !== undefined) {
    return spreadsheetImportFields.find(
      (field) =>
        field.fieldMetadataItemId === column.fieldMetadataId &&
        field.isCompositeSubField === true &&
        field.compositeSubFieldKey === column.subFieldName &&
        field.isRelationConnectField !== true,
    );
  }

  return spreadsheetImportFields.find(
    (field) =>
      field.fieldMetadataItemId === column.fieldMetadataId &&
      field.isNestedField !== true,
  );
};

export const getSpreadsheetImportHeaderDefinitions = ({
  fieldMetadataItems,
  objectMetadataItems,
  spreadsheetImportFields,
}: {
  fieldMetadataItems: FieldMetadataItem[];
  objectMetadataItems: EnrichedObjectMetadataItem[];
  spreadsheetImportFields: SpreadsheetImportFields;
}): SpreadsheetImportHeaderDefinition[] => {
  const exportFieldMetadataItems = fieldMetadataItems.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive !== false && fieldMetadataItem.name !== 'id',
  );
  const exportColumns = getSpreadsheetExportColumns(
    getSpreadsheetExportColumnDefinitions(exportFieldMetadataItems),
  );

  return exportColumns.flatMap(
    (column): SpreadsheetImportHeaderDefinition[] => {
      const field = getFieldForExportColumn({
        column,
        fieldMetadataItems,
        objectMetadataItems,
        spreadsheetImportFields,
      });

      return field
        ? [
            {
              header: cleanZWJFromImportedValue(
                getSpreadsheetExportHeader(column),
              ),
              fieldKey: field.key,
              kind: 'importable' as const,
            },
          ]
        : [
            {
              header: cleanZWJFromImportedValue(
                getSpreadsheetExportHeader(column),
              ),
              kind: 'readOnly' as const,
            },
          ];
    },
  );
};
