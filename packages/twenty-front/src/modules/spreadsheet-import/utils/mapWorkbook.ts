import { cleanZWJFromImportedValue } from '@/spreadsheet-import/utils/cleanZWJFromImportedValue';
import { utils, type WorkBook } from 'xlsx-ugnis';

export const mapWorkbook = (workbook: WorkBook, sheetName?: string) => {
  const worksheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
  const data = utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    raw: true,
  }) as unknown[][];

  // Clean ZWJ characters from imported CSV data to restore original values
  // This reverses the ZWJ protection applied during export
  const hasExcelSeparatorDirective = /^sep=.$/i.test(
    String((data[0] as string[] | undefined)?.[0] ?? ''),
  );
  const dataWithoutExcelSeparatorDirective = hasExcelSeparatorDirective
    ? data.slice(1)
    : data;

  const cleanedData = dataWithoutExcelSeparatorDirective.map((row) =>
    row.map((cell) => {
      if (typeof cell === 'string') {
        return cleanZWJFromImportedValue(cell);
      }

      if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        return cell.toISOString();
      }

      if (cell === null || cell === undefined) {
        return undefined;
      }

      return String(cell);
    }),
  );

  return cleanedData;
};
