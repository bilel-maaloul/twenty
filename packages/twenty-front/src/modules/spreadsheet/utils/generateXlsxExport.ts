import {
  getSpreadsheetExportColumns,
  getSpreadsheetExportHeader,
  getSpreadsheetExportRows,
  type SpreadsheetExportColumnInput,
  type SpreadsheetExportRow,
} from '@/spreadsheet/utils/getSpreadsheetExportData';
import { unzipSync, zipSync } from 'fflate';
import { saveAs } from 'file-saver';
import { utils, write } from 'xlsx-ugnis';

export type GenerateXlsxExportOptions = {
  columns: SpreadsheetExportColumnInput[];
  rows: SpreadsheetExportRow[];
};

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const XLSX_SHEET_NAME = 'Export';

export const XLSX_COLUMN_WIDTH_MIN = 10;
export const XLSX_COLUMN_WIDTH_MAX = 40;
const XLSX_COLUMN_WIDTH_PADDING = 2;

const getStringLength = (value: string): number =>
  Math.max(...value.split(/\r?\n/).map((line) => [...line].length), 0);

const getCellDisplayLength = (value: unknown): number => {
  if (value === undefined || value === null) {
    return 0;
  }

  if (value instanceof Date) {
    return getStringLength(value.toISOString());
  }

  return getStringLength(String(value));
};

export const getSpreadsheetExportColumnWidths = (
  columns: SpreadsheetExportColumnInput[],
  rows: SpreadsheetExportRow[],
): number[] => {
  const exportColumns = getSpreadsheetExportColumns(columns);
  const exportRows = getSpreadsheetExportRows(rows, exportColumns);

  return exportColumns.map((column) => {
    const maximumCellLength = Math.max(
      getStringLength(getSpreadsheetExportHeader(column)),
      ...exportRows.map((row) => getCellDisplayLength(row[column.field])),
    );

    return Math.min(
      XLSX_COLUMN_WIDTH_MAX,
      Math.max(
        XLSX_COLUMN_WIDTH_MIN,
        maximumCellLength + XLSX_COLUMN_WIDTH_PADDING,
      ),
    );
  });
};

type XlsxBytes = Uint8Array<ArrayBuffer>;
type XlsxZipEntries = Record<string, Uint8Array<ArrayBuffer>>;

const freezeFirstRow = (xlsxBytes: Uint8Array): XlsxBytes => {
  const entries = unzipSync(xlsxBytes) as XlsxZipEntries;
  const worksheetPath = Object.keys(entries).find((path) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(path),
  );

  if (worksheetPath === undefined) {
    return Uint8Array.from(xlsxBytes);
  }

  const worksheetXml = new TextDecoder().decode(entries[worksheetPath]);
  const freezePaneXml =
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';

  const worksheetXmlWithFreezePane =
    /<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/.test(worksheetXml)
      ? worksheetXml.replace(
          /<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/,
          freezePaneXml,
        )
      : worksheetXml.replace('</dimension>', `</dimension>${freezePaneXml}`);

  entries[worksheetPath] = new TextEncoder().encode(worksheetXmlWithFreezePane);

  return zipSync(entries);
};

export const generateXlsx = ({
  columns,
  rows,
}: GenerateXlsxExportOptions): XlsxBytes => {
  const exportColumns = getSpreadsheetExportColumns(columns);
  const exportRows = getSpreadsheetExportRows(rows, exportColumns);
  const headers = exportColumns.map(getSpreadsheetExportHeader);
  const values = exportRows.map((row) =>
    exportColumns.map((column) => row[column.field]),
  );
  const worksheet = utils.aoa_to_sheet([headers, ...values]);

  worksheet['!autofilter'] = {
    ref: utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: exportRows.length, c: exportColumns.length - 1 },
    }),
  };
  worksheet['!cols'] = getSpreadsheetExportColumnWidths(columns, rows).map(
    (wch) => ({ wch }),
  );

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, XLSX_SHEET_NAME);

  const workbookBytes = new Uint8Array(
    write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    }) as ArrayBuffer,
  );

  return freezeFirstRow(workbookBytes);
};

export const xlsxDownloader = (
  filename: string,
  data: GenerateXlsxExportOptions,
): void => {
  const blob = new Blob([generateXlsx(data)], { type: XLSX_MIME_TYPE });
  saveAs(blob, filename);
};
