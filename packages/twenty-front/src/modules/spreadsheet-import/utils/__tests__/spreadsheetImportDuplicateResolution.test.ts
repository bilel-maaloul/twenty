import {
  getInconsistentSpreadsheetImportDuplicateGroupIds,
  getSpreadsheetImportDuplicateGroupId,
  getSpreadsheetImportDuplicateResolutionCounts,
  getSpreadsheetImportDuplicateResolutionStatus,
  retainCurrentSpreadsheetImportDuplicateResolutions,
  getUnresolvedSpreadsheetImportDuplicateGroupCount,
  shouldRunSpreadsheetImportRowPreflight,
} from '@/spreadsheet-import/utils/spreadsheetImportDuplicateResolution';
import {
  type SpreadsheetImportDuplicateGroup,
  type SpreadsheetImportDuplicateResolution,
} from '@/spreadsheet-import/types';

const createGroup = (
  rowNumbers: number[],
  value = 'shared.example',
): SpreadsheetImportDuplicateGroup => {
  const group = {
    kind: 'unique-constraint' as const,
    fields: [{ label: 'Website', value }],
    rows: rowNumbers.map((rowNumber) => ({ rowNumber })),
  };

  return { ...group, id: getSpreadsheetImportDuplicateGroupId(group) };
};

const createRow = (
  rowNumber: number,
  groups: SpreadsheetImportDuplicateGroup[],
) => ({
  __index: `row-${rowNumber}`,
  __duplicateInFileGroups: JSON.stringify(groups),
  __duplicateInFileRowNumber: String(rowNumber),
});

describe('spreadsheet import duplicate resolution', () => {
  it('keeps a newly detected unique duplicate group unresolved', () => {
    const group = createGroup([2, 3]);
    const resolutions: Record<string, SpreadsheetImportDuplicateResolution> =
      {};
    const inconsistentGroupIds =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [group],
        resolutions,
      );

    expect(
      getUnresolvedSpreadsheetImportDuplicateGroupCount(
        [group],
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe(1);
    expect(
      getSpreadsheetImportDuplicateResolutionStatus(
        createRow(2, [group]),
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe('UNRESOLVED');
  });

  it.each([
    { selectedRowNumber: 2, kept: 2, skipped: 3 },
    { selectedRowNumber: 3, kept: 3, skipped: 2 },
  ])(
    'keeps row $selectedRowNumber and explicitly skips the other row',
    ({ selectedRowNumber, kept, skipped }) => {
      const group = createGroup([2, 3]);
      const resolutions = {
        [group.id]: { kind: 'KEEP_ONE', rowNumber: selectedRowNumber } as const,
      };
      const inconsistentGroupIds =
        getInconsistentSpreadsheetImportDuplicateGroupIds(
          [group],
          resolutions,
        );

      expect(
        getSpreadsheetImportDuplicateResolutionStatus(
          createRow(kept, [group]),
          resolutions,
          inconsistentGroupIds,
        ),
      ).toBe('KEEP_ONE');
      expect(
        getSpreadsheetImportDuplicateResolutionStatus(
          createRow(skipped, [group]),
          resolutions,
          inconsistentGroupIds,
        ),
      ).toBe('SKIP');
    },
  );

  it('skips every row only after an explicit SKIP_ALL choice', () => {
    const group = createGroup([2, 3]);
    const resolutions = { [group.id]: { kind: 'SKIP_ALL' } as const };
    const inconsistentGroupIds =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [group],
        resolutions,
      );

    expect(
      getSpreadsheetImportDuplicateResolutionStatus(
        createRow(2, [group]),
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe('SKIP');
    expect(
      getSpreadsheetImportDuplicateResolutionStatus(
        createRow(3, [group]),
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe('SKIP');
  });

  it('updates duplicate planned skip counts only after an explicit group choice', () => {
    const group = createGroup([2, 3]);
    const rows = [createRow(2, [group]), createRow(3, [group])];
    const unresolvedResolutions: Record<
      string,
      SpreadsheetImportDuplicateResolution
    > = {};
    const unresolvedIssues =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [group],
        unresolvedResolutions,
      );

    expect(
      getSpreadsheetImportDuplicateResolutionCounts(
        rows,
        unresolvedResolutions,
        unresolvedIssues,
      ),
    ).toEqual({
      duplicateRows: 2,
      unresolvedGroups: 1,
      keptRows: 0,
      skippedRows: 0,
    });

    const keepOne = { [group.id]: { kind: 'KEEP_ONE', rowNumber: 2 } as const };
    const keepOneIssues =
      getInconsistentSpreadsheetImportDuplicateGroupIds([group], keepOne);

    expect(
      getSpreadsheetImportDuplicateResolutionCounts(
        rows,
        keepOne,
        keepOneIssues,
      ),
    ).toEqual({
      duplicateRows: 2,
      unresolvedGroups: 0,
      keptRows: 1,
      skippedRows: 1,
    });

    const skipAll = { [group.id]: { kind: 'SKIP_ALL' } as const };
    const skipAllIssues =
      getInconsistentSpreadsheetImportDuplicateGroupIds([group], skipAll);

    expect(
      getSpreadsheetImportDuplicateResolutionCounts(
        rows,
        skipAll,
        skipAllIssues,
      ).skippedRows,
    ).toBe(2);
  });

  it('supports a single survivor in groups with more than two rows', () => {
    const group = createGroup([2, 3, 4]);
    const resolutions = {
      [group.id]: { kind: 'KEEP_ONE', rowNumber: 4 } as const,
    };
    const inconsistentGroupIds =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [group],
        resolutions,
      );

    expect(
      [2, 3, 4].map((rowNumber) =>
        getSpreadsheetImportDuplicateResolutionStatus(
          createRow(rowNumber, [group]),
          resolutions,
          inconsistentGroupIds,
        ),
      ),
    ).toEqual(['SKIP', 'SKIP', 'KEEP_ONE']);
  });

  it('allows consistent choices across overlapping groups and blocks contradictory choices', () => {
    const firstGroup = createGroup([2, 3], 'first.example');
    const secondGroup = createGroup([3, 4], 'second.example');
    const consistentResolutions = {
      [firstGroup.id]: { kind: 'KEEP_ONE', rowNumber: 2 } as const,
      [secondGroup.id]: { kind: 'KEEP_ONE', rowNumber: 4 } as const,
    };

    expect(
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [firstGroup, secondGroup],
        consistentResolutions,
      ).size,
    ).toBe(0);

    const contradictoryResolutions = {
      [firstGroup.id]: { kind: 'KEEP_ONE', rowNumber: 2 } as const,
      [secondGroup.id]: { kind: 'KEEP_ONE', rowNumber: 3 } as const,
    };
    const inconsistentGroupIds =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [firstGroup, secondGroup],
        contradictoryResolutions,
      );

    expect(inconsistentGroupIds).toEqual(
      new Set([firstGroup.id, secondGroup.id]),
    );
    expect(
      getUnresolvedSpreadsheetImportDuplicateGroupCount(
        [firstGroup, secondGroup],
        contradictoryResolutions,
        inconsistentGroupIds,
      ),
    ).toBe(2);
  });

  it('invalidates a decision when an edit changes the conflicting value or rows', () => {
    const originalGroup = createGroup([2, 3]);
    const editedGroup = createGroup([2, 3], 'changed.example');
    const reducedGroup = createGroup([2]);

    expect(editedGroup.id).not.toBe(originalGroup.id);
    expect(reducedGroup.id).not.toBe(originalGroup.id);
    const existingResolutions = {
      [originalGroup.id]: { kind: 'KEEP_ONE', rowNumber: 2 } as const,
    };

    expect(
      retainCurrentSpreadsheetImportDuplicateResolutions(
        existingResolutions,
        [editedGroup],
      ),
    ).toEqual({});
    expect(
      retainCurrentSpreadsheetImportDuplicateResolutions(
        existingResolutions,
        [],
      ),
    ).toEqual({});
  });

  it('sends only a selected survivor through the normal CRM preflight hook', () => {
    const group = createGroup([2, 3]);
    const resolutions = {
      [group.id]: { kind: 'KEEP_ONE', rowNumber: 2 } as const,
    };
    const inconsistentGroupIds =
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        [group],
        resolutions,
      );
    const selectedRow = createRow(2, [group]);
    const skippedRow = createRow(3, [group]);

    expect(
      shouldRunSpreadsheetImportRowPreflight(
        selectedRow,
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe(true);
    expect(
      shouldRunSpreadsheetImportRowPreflight(
        skippedRow,
        resolutions,
        inconsistentGroupIds,
      ),
    ).toBe(false);

    const selectedRowStatus = getSpreadsheetImportDuplicateResolutionStatus(
      selectedRow,
      resolutions,
      inconsistentGroupIds,
    );

    expect(selectedRowStatus).toBe('KEEP_ONE');
  });
});
