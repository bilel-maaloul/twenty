import { useMemo } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useExportProcessRecordsForCSV } from '@/object-record/object-options-dropdown/hooks/useExportProcessRecordsForCSV';
import { csvDownloader } from '@/object-record/record-index/export/hooks/useRecordIndexExportRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type SpreadsheetExportFormat } from '@/spreadsheet/types/SpreadsheetExportFormat';
import { getSpreadsheetExportColumnDefinitions } from '@/spreadsheet/utils/getSpreadsheetExportColumnDefinitions';
import { xlsxDownloader } from '@/spreadsheet/utils/generateXlsxExport';
import { isDefined } from 'twenty-shared/utils';

export type UseSingleExportTableDataOptions = {
  filename: string;
  format?: SpreadsheetExportFormat;
  objectMetadataItem: EnrichedObjectMetadataItem;
  recordId: string;
};
export const useExportSingleRecord = ({
  filename,
  format = 'csv',
  objectMetadataItem,
  recordId,
}: UseSingleExportTableDataOptions) => {
  const { processRecordsForCSVExport } = useExportProcessRecordsForCSV(
    objectMetadataItem.nameSingular,
  );

  const downloadExport = useMemo(
    () =>
      (
        record: ObjectRecord,
        columns: ReturnType<typeof getSpreadsheetExportColumnDefinitions>,
      ) => {
        const recordToArray = [record];
        const recordsProcessedForExport =
          processRecordsForCSVExport(recordToArray);

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

  const columns = getSpreadsheetExportColumnDefinitions(
    objectMetadataItem.fields.filter((field) => field.isActive),
    {
      headerDisambiguationFieldMetadataItems: objectMetadataItem.fields.filter(
        (field) => field.isActive,
      ),
    },
  );
  const { record, error } = useFindOneRecord({
    objectNameSingular: objectMetadataItem.nameSingular,
    objectRecordId: recordId,
    withSoftDeleted: true,
  });
  const download = () => {
    if (isDefined(error) || !isDefined(record)) {
      return;
    }
    downloadExport(record, columns);
  };
  return { download };
};
