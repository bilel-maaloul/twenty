import { json2csv } from 'json-2-csv';
import { useMemo } from 'react';

import { EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE } from '@/object-record/object-options-dropdown/constants/ExportTableDataDefaultPageSize';
import { useExportProcessRecordsForCSV } from '@/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV';
import {
  useRecordIndexLazyFetchRecords,
  type UseRecordDataOptions,
} from '@/object-record/record-index/export/hooks/useRecordIndexLazyFetchRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import {
  getSpreadsheetExportColumns,
  getSpreadsheetExportHeader,
  getSpreadsheetExportRows,
  type SpreadsheetExportColumnInput,
  type SpreadsheetExportRow,
} from '@/spreadsheet/utils/getSpreadsheetExportData';
import { type SpreadsheetExportColumnDefinition } from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { type SpreadsheetExportFormat } from '@/spreadsheet/types/SpreadsheetExportFormat';
import { xlsxDownloader } from '@/spreadsheet/utils/generateXlsxExport';
import { formatValueForCSV } from '@/spreadsheet-import/utils/formatValueForCSV';
import { t } from '@lingui/core/macro';
import { saveAs } from 'file-saver';
import { isDefined } from 'twenty-shared/utils';
import { isUndefinedOrNull } from '~/utils/isUndefinedOrNull';

type GenerateExportOptions = {
  columns: SpreadsheetExportColumnInput[];
  rows: SpreadsheetExportRow[];
};

type GenerateExport = (data: GenerateExportOptions) => string;

type ExportProgress = {
  exportedRecordCount?: number;
  totalRecordCount?: number;
  displayType: 'percentage' | 'number';
};

export const generateCsv: GenerateExport = ({
  columns,
  rows,
}: GenerateExportOptions): string => {
  const columnsToExport = getSpreadsheetExportColumns(columns);

  const keys = columnsToExport.map((column) => ({
    field: column.field,
    title: formatValueForCSV(getSpreadsheetExportHeader(column)),
  }));

  const exportRows = getSpreadsheetExportRows(rows, columnsToExport);

  const csvContent = json2csv(exportRows, {
    keys,
    delimiter: { field: ',', wrap: '"', eol: '\r\n' },
    emptyFieldValue: '',
    excelBOM: false,
    // Note: We handle CSV injection prevention manually with ZWJ approach above
    // This preserves original which the csvSecurity option does not do
  });

  return `\uFEFFsep=,\r\n${csvContent}`;
};

const percentage = (part: number, whole: number): number => {
  return Math.round((part / whole) * 100);
};

export const displayedExportProgress = (progress?: ExportProgress): string => {
  if (isUndefinedOrNull(progress?.exportedRecordCount)) {
    return t`Export`;
  }

  if (
    progress.displayType === 'percentage' &&
    isDefined(progress?.totalRecordCount)
  ) {
    const percentageValue = percentage(
      progress.exportedRecordCount,
      progress.totalRecordCount,
    );
    return t`Export (${percentageValue}%)`;
  }

  const exportedCount = progress.exportedRecordCount;
  return t`Export (${exportedCount})`;
};

const downloader = (mimeType: string, generator: GenerateExport) => {
  return (filename: string, data: GenerateExportOptions) => {
    const blob = new Blob([new TextEncoder().encode(generator(data))], {
      type: `${mimeType};charset=utf-8`,
    });
    saveAs(blob, filename);
  };
};

export const csvDownloader = downloader('text/csv', generateCsv);

type UseExportTableDataOptions = Omit<UseRecordDataOptions, 'callback'> & {
  filename: string;
  format?: SpreadsheetExportFormat;
};

export const useRecordIndexExportRecords = ({
  delayMs,
  filename,
  maximumRequests = 1000,
  objectMetadataItem,
  pageSize = EXPORT_TABLE_DATA_DEFAULT_PAGE_SIZE,
  recordIndexId,
  format = 'csv',
  viewType,
}: UseExportTableDataOptions) => {
  const { processRecordsForCSVExport } = useExportProcessRecordsForCSV(
    objectMetadataItem.nameSingular,
  );

  const downloadExport = useMemo(
    () =>
      (
        records: ObjectRecord[],
        columns: SpreadsheetExportColumnDefinition[],
      ) => {
        const recordsProcessedForExport = processRecordsForCSVExport(records);

        if (format === 'xlsx') {
          xlsxDownloader(filename, {
            rows: recordsProcessedForExport,
            columns,
          });
        } else {
          csvDownloader(filename, {
            rows: recordsProcessedForExport,
            columns,
          });
        }
      },
    [filename, format, processRecordsForCSVExport],
  );

  const { getTableData: download, progress } = useRecordIndexLazyFetchRecords({
    delayMs,
    maximumRequests,
    objectMetadataItem,
    pageSize,
    recordIndexId,
    callback: downloadExport,
    viewType,
  });

  return { progress, download };
};
