import { type SpreadsheetImportStepType } from '@/spreadsheet-import/steps/types/SpreadsheetImportStepType';
import { type ImportedRow } from '@/spreadsheet-import/types';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { type SpreadsheetImportHeaderValidationError } from '@/spreadsheet-import/utils/getStrictMatchedColumns';
import { type WorkBook } from 'xlsx-ugnis';

export type SpreadsheetImportStep =
  | {
      type: SpreadsheetImportStepType.upload;
    }
  | {
      type: SpreadsheetImportStepType.selectSheet;
      workbook: WorkBook;
    }
  | {
      type: SpreadsheetImportStepType.selectHeader;
      data: ImportedRow[];
    }
  | {
      type: SpreadsheetImportStepType.matchColumns;
      data: ImportedRow[];
      headerValues: ImportedRow;
      headerValidationErrors?: SpreadsheetImportHeaderValidationError[];
    }
  | {
      type: SpreadsheetImportStepType.validateData;
      data: any[];
      importedColumns: SpreadsheetColumns;
    }
  | {
      type: SpreadsheetImportStepType.loading;
    }
  | {
      type: SpreadsheetImportStepType.importData;
      recordsToImportCount: number;
    };
