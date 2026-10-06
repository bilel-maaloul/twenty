import { type SpreadsheetImportInfo } from '@/spreadsheet-import/types';
import {
  type SpreadsheetImportPreflightAction,
  type SpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/types';

export type ImportedStructuredRowMetadata = {
  __index: string;
  __excelRowNumber?: number;
  __errors?: Error | null;
  __preflight?: SpreadsheetImportPreflightResult;
  __preflightAction?: SpreadsheetImportPreflightAction;
  __fieldDecisions?: string;
  __sourceStates?: string;
  __fieldDecisionSnapshots?: string;
  __preflightActionContext?: string;
  __duplicateInFile?: boolean;
  __duplicateInFileGroups?: string;
  __duplicateInFileRowNumber?: string;
  __duplicateResolutionStatus?: 'KEEP_ONE' | 'SKIP';
};
export type Error = { [key: string]: SpreadsheetImportInfo };
export type Errors = { [id: string]: Error };
