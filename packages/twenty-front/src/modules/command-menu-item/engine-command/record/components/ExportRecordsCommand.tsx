import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useUnmountCommand } from '@/command-menu-item/engine-command/hooks/useUnmountEngineCommand';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { commandMenuItemProgressFamilyState } from '@/command-menu-item/states/commandMenuItemProgressFamilyState';
import { ExportFormatPicker } from '@/command-menu-item/engine-command/record/components/ExportFormatPicker';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useRecordIndexExportRecords } from '@/object-record/record-index/export/hooks/useRecordIndexExportRecords';
import { useExportSingleRecord } from '@/object-record/record-show/hooks/useExportSingleRecord';
import { type SpreadsheetExportFormat } from '@/spreadsheet/types/SpreadsheetExportFormat';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

const ExportIndexRecordsContent = ({
  objectMetadataItem,
  recordIndexId,
  commandMenuItemId,
  setCommandMenuItemProgress,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  recordIndexId: string;
  commandMenuItemId: string;
  setCommandMenuItemProgress: (value: number | undefined) => void;
}) => {
  const [format, setFormat] = useState<SpreadsheetExportFormat>();
  const unmountCommand = useUnmountCommand();
  const filename = `${objectMetadataItem.nameSingular}.${format ?? 'xlsx'}`;
  const { download, progress } = useRecordIndexExportRecords({
    delayMs: 100,
    format,
    objectMetadataItem,
    recordIndexId,
    filename,
  });

  useEffect(() => {
    if (
      isDefined(progress.totalRecordCount) &&
      isDefined(progress.processedRecordCount) &&
      progress.totalRecordCount > 0
    ) {
      const percentage = Math.round(
        (progress.processedRecordCount / progress.totalRecordCount) * 100,
      );
      setCommandMenuItemProgress(percentage);
    }
  }, [progress, setCommandMenuItemProgress]);

  return (
    <>
      <ExportFormatPicker
        modalInstanceId={`export-format-${commandMenuItemId}`}
        onCancel={() => unmountCommand(commandMenuItemId)}
        onSelect={setFormat}
      />
      <HeadlessEngineCommandWrapperEffect
        execute={download}
        ready={isDefined(format)}
      />
    </>
  );
};

const ExportShowRecordContent = ({
  objectMetadataItem,
  recordId,
  commandMenuItemId,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  recordId: string;
  commandMenuItemId: string;
}) => {
  const [format, setFormat] = useState<SpreadsheetExportFormat>();
  const unmountCommand = useUnmountCommand();
  const filename = `${objectMetadataItem.nameSingular}.${format ?? 'xlsx'}`;
  const { download } = useExportSingleRecord({
    format,
    filename,
    objectMetadataItem,
    recordId,
  });

  return (
    <>
      <ExportFormatPicker
        modalInstanceId={`export-format-${commandMenuItemId}`}
        onCancel={() => unmountCommand(commandMenuItemId)}
        onSelect={setFormat}
      />
      <HeadlessEngineCommandWrapperEffect
        execute={download}
        ready={isDefined(format)}
      />
    </>
  );
};

export const ExportRecordsCommand = () => {
  const { objectMetadataItem, recordIndexId, selectedRecords } =
    useHeadlessCommandContextApi();

  const engineCommandId = useAvailableComponentInstanceIdOrThrow(
    CommandComponentInstanceContext,
  );

  const setCommandMenuItemProgress = useSetAtomFamilyState(
    commandMenuItemProgressFamilyState,
    engineCommandId,
  );

  if (!isDefined(objectMetadataItem)) {
    throw new Error('Object metadata item is required to export records');
  }

  const recordId = selectedRecords[0]?.id;
  const isShowPageExport = !isDefined(recordIndexId) && isDefined(recordId);

  if (isShowPageExport) {
    return (
      <ExportShowRecordContent
        objectMetadataItem={objectMetadataItem}
        recordId={recordId}
        commandMenuItemId={engineCommandId}
      />
    );
  }

  if (!isDefined(recordIndexId)) {
    throw new Error(
      'Record index ID is required to export records from index page',
    );
  }

  return (
    <ViewComponentInstanceContext.Provider
      value={{ instanceId: recordIndexId }}
    >
      <ExportIndexRecordsContent
        objectMetadataItem={objectMetadataItem}
        recordIndexId={recordIndexId}
        commandMenuItemId={engineCommandId}
        setCommandMenuItemProgress={setCommandMenuItemProgress}
      />
    </ViewComponentInstanceContext.Provider>
  );
};
