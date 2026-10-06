import {
  type SpreadsheetImportDuplicateGroup,
  type SpreadsheetImportDuplicateResolution,
  type SpreadsheetImportDuplicateResolutionStatus,
} from '@/spreadsheet-import/types/SpreadsheetImportDuplicateGroup';
import { type SpreadsheetImportInfo } from '@/spreadsheet-import/types/SpreadsheetImportInfo';
import { shouldRunSpreadsheetImportPreflight } from '@/spreadsheet-import/utils/spreadsheetImportValidation';
import { type SpreadsheetImportValidationField } from '@/spreadsheet-import/utils/spreadsheetImportValidation';

type DuplicateResolutionRow = {
  __index: string;
  __preflightAction?: string;
  __duplicateInFileGroups?: string;
  __duplicateInFileRowNumber?: string;
};

export type SpreadsheetImportDuplicateResolutionRowStatus =
  SpreadsheetImportDuplicateResolutionStatus | undefined;

export const getSpreadsheetImportDuplicateGroupId = (
  group: Omit<SpreadsheetImportDuplicateGroup, 'id'>,
) =>
  JSON.stringify([
    group.kind,
    group.fields.map(({ label, value }) => [label, value]),
    group.rows.map(({ rowNumber }) => rowNumber),
  ]);

export const getSpreadsheetImportDuplicateGroups = (
  rows: DuplicateResolutionRow[],
) => {
  const groupsById = new Map<string, SpreadsheetImportDuplicateGroup>();

  rows.forEach((row) => {
    const groups = JSON.parse(
      row.__duplicateInFileGroups ?? '[]',
    ) as SpreadsheetImportDuplicateGroup[];

    groups.forEach((group) => groupsById.set(group.id, group));
  });

  return [...groupsById.values()];
};

export const retainCurrentSpreadsheetImportDuplicateResolutions = (
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  groups: SpreadsheetImportDuplicateGroup[],
) => {
  const currentGroupIds = new Set(groups.map(({ id }) => id));

  return Object.fromEntries(
    Object.entries(resolutions).filter(([groupId]) =>
      currentGroupIds.has(groupId),
    ),
  );
};

export const getInconsistentSpreadsheetImportDuplicateGroupIds = (
  groups: SpreadsheetImportDuplicateGroup[],
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
) => {
  const inconsistentGroupIds = new Set<string>();

  groups.forEach((group) => {
    const resolution = resolutions[group.id];

    if (resolution?.kind !== 'KEEP_ONE') {
      return;
    }

    groups.forEach((overlappingGroup) => {
      if (
        overlappingGroup.id === group.id ||
        !overlappingGroup.rows.some(
          ({ rowNumber }) => rowNumber === resolution.rowNumber,
        )
      ) {
        return;
      }

      const overlappingResolution = resolutions[overlappingGroup.id];

      if (
        overlappingResolution?.kind === 'SKIP_ALL' ||
        (overlappingResolution?.kind === 'KEEP_ONE' &&
          overlappingResolution.rowNumber !== resolution.rowNumber)
      ) {
        inconsistentGroupIds.add(group.id);
        inconsistentGroupIds.add(overlappingGroup.id);
      }
    });
  });

  return inconsistentGroupIds;
};

export const getSpreadsheetImportDuplicateResolutionStatus = (
  row: DuplicateResolutionRow,
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  inconsistentGroupIds: ReadonlySet<string>,
): SpreadsheetImportDuplicateResolutionStatus | undefined => {
  const groups = JSON.parse(
    row.__duplicateInFileGroups ?? '[]',
  ) as SpreadsheetImportDuplicateGroup[];

  if (groups.length === 0) {
    return undefined;
  }

  if (groups.some((group) => !resolutions[group.id])) {
    return 'UNRESOLVED';
  }

  if (groups.some((group) => inconsistentGroupIds.has(group.id))) {
    return 'INCONSISTENT';
  }

  const rowNumber = Number(row.__duplicateInFileRowNumber);

  if (
    groups.some((group) => {
      const resolution = resolutions[group.id];

      return (
        resolution.kind === 'SKIP_ALL' || resolution.rowNumber !== rowNumber
      );
    })
  ) {
    return 'SKIP';
  }

  return 'KEEP_ONE';
};

export const shouldRunSpreadsheetImportRowPreflight = (
  row: DuplicateResolutionRow & {
    __errors?: Record<string, SpreadsheetImportInfo> | null;
    __sourceStates?: string;
  },
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  inconsistentGroupIds: ReadonlySet<string>,
  fields: ReadonlyArray<SpreadsheetImportValidationField> = [],
) => {
  const resolutionStatus = getSpreadsheetImportDuplicateResolutionStatus(
    row,
    resolutions,
    inconsistentGroupIds,
  );

  return (
    (resolutionStatus === undefined || resolutionStatus === 'KEEP_ONE') &&
    shouldRunSpreadsheetImportPreflight(row, fields)
  );
};

export const getUnresolvedSpreadsheetImportDuplicateGroupCount = (
  groups: SpreadsheetImportDuplicateGroup[],
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  inconsistentGroupIds: ReadonlySet<string>,
) =>
  groups.filter(
    (group) => !resolutions[group.id] || inconsistentGroupIds.has(group.id),
  ).length;

export const getSpreadsheetImportDuplicateResolutionCounts = (
  rows: DuplicateResolutionRow[],
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  inconsistentGroupIds: ReadonlySet<string>,
) => {
  const duplicateRows = rows.filter(
    (row) => JSON.parse(row.__duplicateInFileGroups ?? '[]').length > 0,
  );

  return {
    duplicateRows: duplicateRows.length,
    unresolvedGroups: getUnresolvedSpreadsheetImportDuplicateGroupCount(
      getSpreadsheetImportDuplicateGroups(rows),
      resolutions,
      inconsistentGroupIds,
    ),
    keptRows: duplicateRows.filter(
      (row) =>
        getSpreadsheetImportDuplicateResolutionStatus(
          row,
          resolutions,
          inconsistentGroupIds,
        ) === 'KEEP_ONE',
    ).length,
    skippedRows: duplicateRows.filter(
      (row) =>
        getSpreadsheetImportDuplicateResolutionStatus(
          row,
          resolutions,
          inconsistentGroupIds,
        ) === 'SKIP',
    ).length,
  };
};

export const getSpreadsheetImportDuplicateRowStatus = (
  row: DuplicateResolutionRow,
  resolutions: Record<string, SpreadsheetImportDuplicateResolution>,
  inconsistentGroupIds: ReadonlySet<string>,
): SpreadsheetImportDuplicateResolutionRowStatus =>
  getSpreadsheetImportDuplicateResolutionStatus(
    row,
    resolutions,
    inconsistentGroupIds,
  );
