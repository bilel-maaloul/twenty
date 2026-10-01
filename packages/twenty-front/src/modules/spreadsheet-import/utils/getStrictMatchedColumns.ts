import { type SpreadsheetColumn } from '@/spreadsheet-import/types/SpreadsheetColumn';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types/SpreadsheetImportField';
import { type SpreadsheetImportFields } from '@/spreadsheet-import/types/SpreadsheetImportFields';
import { type SpreadsheetImportHeaderDefinition } from '@/spreadsheet-import/types/SpreadsheetImportHeaderDefinition';
import { type ImportedRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedRow';
import { setColumn } from '@/spreadsheet-import/utils/setColumn';
import { t } from '@lingui/core/macro';
import {
  getColumnErrorMessage,
  getSpreadsheetImportHeaderValidationErrorMessage,
  validateSpreadsheetImportHeaders,
  type SpreadsheetImportHeaderValidationError,
  type StrictSpreadsheetImportHeaderValidationResult,
} from '@/spreadsheet-import/utils/validateSpreadsheetImportHeaders';

export type {
  SpreadsheetImportHeaderValidationError,
  SpreadsheetImportHeaderValidationErrorType,
  StrictSpreadsheetImportHeaderValidationResult,
} from '@/spreadsheet-import/utils/validateSpreadsheetImportHeaders';

export { getSpreadsheetImportHeaderValidationErrorMessage };

const createErrorColumn = ({
  columnIndex,
  header,
  type,
}: SpreadsheetImportHeaderValidationError): SpreadsheetColumn => ({
  index: columnIndex,
  header,
  type: SpreadsheetColumnType.matchedError,
  value: '',
  errorMessage: getColumnErrorMessage(type),
});

const createReadOnlyColumn = ({
  columnIndex,
  header,
}: {
  columnIndex: number;
  header: string;
}): SpreadsheetColumn => ({
  index: columnIndex,
  header,
  type: SpreadsheetColumnType.recognizedReadOnly,
  message: t`Recognized read-only field; this column will not be imported.`,
});

export const getStrictMatchedColumns = ({
  data,
  fields,
  headerValues,
  headerDefinitions,
}: {
  data: ImportedRow[];
  fields: SpreadsheetImportFields;
  headerValues: ImportedRow;
  headerDefinitions: SpreadsheetImportHeaderDefinition[];
}): StrictSpreadsheetImportHeaderValidationResult & {
  columns: SpreadsheetColumns;
} => {
  const validation = validateSpreadsheetImportHeaders({
    data,
    fieldKeys: new Set(fields.map(({ key }) => key)),
    headerDefinitions,
    headerValues,
  });

  const columns: SpreadsheetColumns = validation.matches.map(
    (match): SpreadsheetColumn => {
      if (match.kind === 'readOnly') {
        return createReadOnlyColumn(match);
      }

      if (match.fieldKey === undefined) {
        const error = validation.errors.find(
          ({ columnIndex }) => columnIndex === match.columnIndex,
        );

        return error
          ? createErrorColumn(error)
          : {
              type: SpreadsheetColumnType.empty,
              index: match.columnIndex,
              header: match.header,
            };
      }

      const field = fields.find(({ key }) => key === match.fieldKey) as
        SpreadsheetImportField | undefined;

      if (!field) {
        return {
          type: SpreadsheetColumnType.matchedError,
          index: match.columnIndex,
          header: match.header,
          value: '',
          errorMessage: getColumnErrorMessage('ambiguous'),
        };
      }

      return setColumn(
        {
          type: SpreadsheetColumnType.empty,
          index: match.columnIndex,
          header: match.header,
        },
        field,
        data,
      );
    },
  );

  return { ...validation, columns };
};
