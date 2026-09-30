import { parseStringArrayFromCSV } from '@/spreadsheet-import/utils/spreadsheetValueFormats';
import { z } from 'zod';

export const spreadsheetImportParseMultiSelectOptionsOrThrow = (
  value: unknown,
) => {
  return parseStringArrayFromCSV(z.string().parse(value));
};
