import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import {
  ensureSpreadsheetExportColumnHeadersUnique,
  getSpreadsheetExportColumnDefinitions,
  getSpreadsheetExportRecordIdColumnDefinition,
  type SpreadsheetExportColumnDefinition,
} from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { sanitizeValueForCSVExport } from '@/spreadsheet-import/utils/sanitizeValueForCSVExport';
import { FieldMetadataType } from '~/generated-metadata/graphql';

export type SpreadsheetExportColumnInput =
  | SpreadsheetExportColumnDefinition
  | Pick<ColumnDefinition<FieldMetadata>, 'label' | 'type' | 'metadata'>;

export type SpreadsheetExportRow = Record<string, unknown>;

const isSpreadsheetExportColumnDefinition = (
  column: SpreadsheetExportColumnInput,
): column is SpreadsheetExportColumnDefinition => 'header' in column;

export const getSpreadsheetExportColumns = (
  columns: SpreadsheetExportColumnInput[],
): SpreadsheetExportColumnDefinition[] => {
  const exportColumns =
    columns.length === 0 || isSpreadsheetExportColumnDefinition(columns[0])
      ? (columns as SpreadsheetExportColumnDefinition[])
      : getSpreadsheetExportColumnDefinitions(
          (
            columns as Pick<
              ColumnDefinition<FieldMetadata>,
              'label' | 'type' | 'metadata'
            >[]
          ).map((column) => ({
            id: column.metadata.fieldName,
            name: column.metadata.fieldName,
            label: column.label,
            type: column.type,
            relation:
              'relationType' in column.metadata && column.metadata.relationType
                ? { type: column.metadata.relationType }
                : null,
          })),
        );

  const recordIdColumn = getSpreadsheetExportRecordIdColumnDefinition();

  return exportColumns.some((column) => column.isRecordId)
    ? exportColumns
    : ensureSpreadsheetExportColumnHeadersUnique([
        recordIdColumn,
        ...exportColumns,
      ]);
};

export const getSpreadsheetExportHeader = (
  column: SpreadsheetExportColumnDefinition,
): string => sanitizeValueForCSVExport(column.header);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getValueAtFieldPath = (
  row: SpreadsheetExportRow,
  fieldPath: string,
): unknown => {
  let value: unknown = row;

  for (const fieldPathPart of fieldPath.split('.')) {
    if (!isRecord(value)) {
      return undefined;
    }

    value = value[fieldPathPart];
  }

  return value;
};

const isNumericColumn = (
  column: SpreadsheetExportColumnDefinition,
): boolean => {
  if (
    column.fieldMetadataType === FieldMetadataType.NUMBER ||
    column.fieldMetadataType === FieldMetadataType.NUMERIC ||
    column.fieldMetadataType === FieldMetadataType.RATING ||
    column.fieldMetadataType === FieldMetadataType.POSITION
  ) {
    return true;
  }

  if (column.fieldMetadataType === FieldMetadataType.CURRENCY) {
    return column.subFieldName === 'amountMicros';
  }

  return (
    column.fieldMetadataType === FieldMetadataType.ADDRESS &&
    (column.subFieldName === 'addressLat' ||
      column.subFieldName === 'addressLng')
  );
};

export type SpreadsheetExportCellValue =
  string | number | boolean | Date | undefined;

export const getSpreadsheetExportCellValue = (
  row: SpreadsheetExportRow,
  column: SpreadsheetExportColumnDefinition,
): SpreadsheetExportCellValue => {
  const value = getValueAtFieldPath(row, column.field);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return sanitizeValueForCSVExport(value);
  }

  if (typeof value === 'number') {
    return isNumericColumn(column)
      ? value
      : sanitizeValueForCSVExport(String(value));
  }

  if (typeof value === 'boolean' || value instanceof Date) {
    return value;
  }

  return sanitizeValueForCSVExport(JSON.stringify(value));
};

export const getSpreadsheetExportRows = (
  rows: SpreadsheetExportRow[],
  columns: SpreadsheetExportColumnDefinition[],
): SpreadsheetExportRow[] =>
  rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [
        column.field,
        getSpreadsheetExportCellValue(row, column),
      ]),
    ),
  );
