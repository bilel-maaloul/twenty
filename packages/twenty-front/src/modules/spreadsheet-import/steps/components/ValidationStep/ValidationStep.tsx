import { SpreadsheetImportTable } from '@/spreadsheet-import/components/SpreadsheetImportTable';
import { StepNavigationButton } from '@/spreadsheet-import/components/StepNavigationButton';
import { useHideStepBar } from '@/spreadsheet-import/hooks/useHideStepBar';
import { useSpreadsheetImportInternal } from '@/spreadsheet-import/hooks/useSpreadsheetImportInternal';
import { type SpreadsheetImportStep } from '@/spreadsheet-import/steps/types/SpreadsheetImportStep';
import { SpreadsheetImportStepType } from '@/spreadsheet-import/steps/types/SpreadsheetImportStepType';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportImportValidationResult,
  type SpreadsheetImportPreflightAction,
  type SpreadsheetImportFieldDecision,
  type SpreadsheetImportPreflightResult,
  type SpreadsheetImportSubmissionResult,
  type SpreadsheetImportDuplicateResolution,
} from '@/spreadsheet-import/types';
import {
  getInconsistentSpreadsheetImportDuplicateGroupIds,
  getSpreadsheetImportDuplicateResolutionCounts,
  getSpreadsheetImportDuplicateGroups,
  getSpreadsheetImportDuplicateResolutionStatus,
  retainCurrentSpreadsheetImportDuplicateResolutions,
  shouldRunSpreadsheetImportRowPreflight,
} from '@/spreadsheet-import/utils/spreadsheetImportDuplicateResolution';
import { type SpreadsheetColumns } from '@/spreadsheet-import/types/SpreadsheetColumns';
import { SpreadsheetColumnType } from '@/spreadsheet-import/types/SpreadsheetColumnType';
import { addErrorsAndRunHooks } from '@/spreadsheet-import/utils/dataMutations';
import { getSpreadsheetImportSourceState } from '@/spreadsheet-import/utils/getSpreadsheetImportSourceState';
import { getSpreadsheetImportOutcome } from '@/spreadsheet-import/utils/getSpreadsheetImportOutcome';
import {
  getSpreadsheetImportValidationState,
  removeResolvedEmptyCellErrors,
  type SpreadsheetImportValidationField,
} from '@/spreadsheet-import/utils/spreadsheetImportValidation';
import {
  getDefaultSpreadsheetImportFieldDecision,
  getDefaultSpreadsheetImportPreflightAction,
  getSpreadsheetImportFieldDifferenceKey,
  shouldSubmitSpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ModalContent } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type RowsChangeData } from 'react-data-grid';
import { isDefined } from 'twenty-shared/utils';
import { IconTrash } from 'twenty-ui/icon';
import { Button, Switch } from 'twenty-ui/input';
import {
  generateColumns,
  generatePreflightColumns,
} from './components/columns';
import { type ImportedStructuredRowMetadata } from './types';

const StyledContentWrapper = styled.div`
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  position: relative;
`;

const StyledToolbar = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  bottom: ${themeCssVariables.spacing[3]};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  left: 50%;
  padding: ${themeCssVariables.spacing[3]};
  position: absolute;
  transform: translateX(-50%);
  width: 400px;
  z-index: 1;
`;

const StyledButtonContainer = styled.div`
  button {
    height: 24px;
  }
`;

const StyledErrorSwitch = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
`;

const StyledErrorSwitchDescription = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.regular};
  margin-left: ${themeCssVariables.spacing[2]};
`;

const StyledScrollContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 0px;
  overflow: auto;
  width: 100%;
`;

const StyledAnalysisSummary = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledSummaryTitle = styled.strong`
  color: ${themeCssVariables.font.color.primary};
`;

const StyledSummaryCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledNoRowsContainer = styled.div`
  display: flex;
  grid-column: 1/-1;
  justify-content: center;
  margin-top: ${themeCssVariables.spacing[8]};
`;

const StyledNoRowsWithErrorsContainer = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  justify-content: center;
  margin: auto 0;
`;

type ValidationStepProps = {
  initialData: ImportedStructuredRow[];
  importedColumns: SpreadsheetColumns;
  file: File;
  onBack: () => void;
  setCurrentStepState: Dispatch<SetStateAction<SpreadsheetImportStep>>;
};

const hasErrorLevelError = (
  row: ImportedStructuredRow & ImportedStructuredRowMetadata,
  fields: ReadonlyArray<SpreadsheetImportValidationField>,
) =>
  getSpreadsheetImportValidationState(row, fields).blockingErrors.length > 0 ||
  Object.entries(row.__errors ?? {}).some(
    ([fieldKey, error]) => fieldKey.startsWith('__') && error.level === 'error',
  );

export const ValidationStep = ({
  initialData,
  importedColumns,
  file,
  setCurrentStepState,
  onBack,
}: ValidationStepProps) => {
  const hideStepBar = useHideStepBar();
  const { enqueueDialog } = useDialogManager();
  const {
    spreadsheetImportFields: fields,
    onSubmit,
    preflightStepHook,
    rowHook,
    tableHook,
  } = useSpreadsheetImportInternal();

  const [data, setData] = useState<
    (ImportedStructuredRow & ImportedStructuredRowMetadata)[]
  >(
    useMemo(
      () =>
        addErrorsAndRunHooks(
          initialData.map((row, index) => ({
            ...row,
            __excelRowNumber: index + 2,
          })) as (ImportedStructuredRow &
            Partial<ImportedStructuredRowMetadata>)[],
          fields,
          rowHook,
          tableHook,
        ),
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      [],
    ),
  );
  const [selectedRows, setSelectedRows] = useState<
    ReadonlySet<number | string>
  >(new Set());
  const [duplicateResolutions, setDuplicateResolutions] = useState<
    Record<string, SpreadsheetImportDuplicateResolution>
  >({});
  const [filterByErrors, setFilterByErrors] = useState(false);
  const dataRef = useRef(data);
  const preflightRequestIdRef = useRef(0);
  const submissionStartedRef = useRef(false);

  dataRef.current = data;

  const updateData = useCallback(
    (rows: typeof data, clearPreflight = true) => {
      const rowsForValidation = clearPreflight
        ? rows.map(({ __preflight: _preflight, ...row }) => row)
        : rows;
      const nextData = addErrorsAndRunHooks(
        rowsForValidation,
        fields,
        rowHook,
        tableHook,
      );
      const currentGroups = getSpreadsheetImportDuplicateGroups(nextData);

      setDuplicateResolutions((currentResolutions) =>
        retainCurrentSpreadsheetImportDuplicateResolutions(
          currentResolutions,
          currentGroups,
        ),
      );
      setData(nextData);
    },
    [setData, rowHook, tableHook, fields],
  );

  const deleteSelectedRows = () => {
    if (selectedRows.size > 0) {
      const newData = data.filter((value) => !selectedRows.has(value.__index));
      updateData(newData);
      setSelectedRows(new Set());
    }
  };

  const { t } = useLingui();

  const duplicateGroups = useMemo(
    () => getSpreadsheetImportDuplicateGroups(data),
    [data],
  );
  const inconsistentDuplicateGroupIds = useMemo(
    () =>
      getInconsistentSpreadsheetImportDuplicateGroupIds(
        duplicateGroups,
        duplicateResolutions,
      ),
    [duplicateGroups, duplicateResolutions],
  );
  const duplicateResolutionCounts = useMemo(
    () =>
      getSpreadsheetImportDuplicateResolutionCounts(
        data,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
      ),
    [data, duplicateResolutions, inconsistentDuplicateGroupIds],
  );
  const unresolvedDuplicateGroupCount =
    duplicateResolutionCounts.unresolvedGroups;

  const updateDuplicateResolution = useCallback(
    (groupId: string, resolution: SpreadsheetImportDuplicateResolution) => {
      setDuplicateResolutions((currentResolutions) => {
        if (
          !getSpreadsheetImportDuplicateGroups(dataRef.current).some(
            (group) => group.id === groupId,
          )
        ) {
          return currentResolutions;
        }

        return { ...currentResolutions, [groupId]: resolution };
      });
    },
    [],
  );

  const preflightSignature = useMemo(
    () =>
      JSON.stringify(
        data
          .filter((row) =>
            shouldRunSpreadsheetImportRowPreflight(
              row,
              duplicateResolutions,
              inconsistentDuplicateGroupIds,
              fields,
            ),
          )
          .map(
            ({
              __index,
              __errors,
              __preflight,
              __preflightAction,
              __fieldDecisions,
              __fieldDecisionSnapshots,
              __preflightActionContext,
              ...row
            }) => [__index, row],
          ),
      ),
    [data, duplicateResolutions, inconsistentDuplicateGroupIds, fields],
  );

  const updatePreflightAction = useCallback(
    (rowId: string, action: SpreadsheetImportPreflightAction) => {
      setData((currentData) =>
        currentData.map((row) =>
          row.__index === rowId
            ? ({
                ...row,
                __preflightAction: action,
              } as unknown as ImportedStructuredRow &
                ImportedStructuredRowMetadata)
            : row,
        ),
      );
    },
    [],
  );

  const updateFieldDecision = useCallback(
    (
      rowId: string,
      differenceKey: string,
      decision: SpreadsheetImportFieldDecision,
    ) => {
      const updateRows = dataRef.current.map((row) => {
        if (row.__index !== rowId) {
          return row;
        }

        const decisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
          string,
          SpreadsheetImportFieldDecision
        >;

        return {
          ...row,
          __fieldDecisions: JSON.stringify({
            ...decisions,
            [differenceKey]: decision,
          }),
        } as ImportedStructuredRow & ImportedStructuredRowMetadata;
      });

      if (fields.some(({ key }) => key === differenceKey)) {
        updateData(updateRows, false);
      } else {
        setData(updateRows);
      }
    },
    [fields, updateData],
  );

  const updateImportedFieldValue = useCallback(
    (rowId: string, fieldKey: string, value: string) => {
      const updatedRows = dataRef.current.map((row) => {
        if (row.__index !== rowId) {
          return row;
        }

        const decisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
          string,
          SpreadsheetImportFieldDecision
        >;
        const sourceStates = JSON.parse(row.__sourceStates ?? '{}') as Record<
          string,
          'EMPTY' | 'VALUE'
        >;

        delete decisions[fieldKey];
        sourceStates[fieldKey] = getSpreadsheetImportSourceState(value);

        return {
          ...row,
          [fieldKey]: value,
          __fieldDecisions: JSON.stringify(decisions),
          __sourceStates: JSON.stringify(sourceStates),
          __preflight: undefined,
          __preflightAction: undefined,
          __preflightActionContext: undefined,
        } as ImportedStructuredRow & ImportedStructuredRowMetadata;
      });

      updateData(updatedRows);
    },
    [updateData],
  );

  const retryFailedPreflightRows = useCallback(() => {
    setData((currentData) =>
      currentData.map((row) => {
        if (row.__preflight?.status !== 'PREFLIGHT_ERROR') {
          return row;
        }

        const nextErrors = { ...(row.__errors ?? {}) };
        delete nextErrors.__preflight;

        return {
          ...row,
          __preflight: undefined,
          __preflightAction: undefined,
          __errors: Object.keys(nextErrors).length > 0 ? nextErrors : null,
        } as ImportedStructuredRow & ImportedStructuredRowMetadata;
      }),
    );
  }, []);

  useEffect(() => {
    if (!isDefined(preflightStepHook)) {
      return;
    }

    const eligibleRows = dataRef.current.filter((row) =>
      shouldRunSpreadsheetImportRowPreflight(
        row,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
        fields,
      ),
    );

    if (eligibleRows.length === 0) {
      return;
    }

    const requestId = ++preflightRequestIdRef.current;
    const timeoutId = setTimeout(async () => {
      try {
        const results = await preflightStepHook(eligibleRows);

        if (requestId !== preflightRequestIdRef.current) {
          return;
        }

        const resultsByRowId = new Map(
          results.map((result) => [result.rowId, result]),
        );

        setData((currentData) =>
          currentData.map((row) => {
            const result = resultsByRowId.get(row.__index);

            if (!isDefined(result)) {
              return row;
            }

            const sourceStates = JSON.parse(
              typeof row.__sourceStates === 'string'
                ? row.__sourceStates
                : '{}',
            ) as Record<string, 'EMPTY' | 'VALUE'>;
            const nextErrors = removeResolvedEmptyCellErrors({
              errors: { ...(row.__errors ?? {}) },
              sourceStates,
              result,
              fields,
            });

            if (
              result.status === 'CONFLICT' ||
              result.status === 'PREFLIGHT_ERROR' ||
              result.uncomparableFieldNames.length > 0
            ) {
              nextErrors.__preflight = {
                level: 'error',
                message:
                  result.status === 'CONFLICT'
                    ? t`This row matches multiple existing records and cannot be imported.`
                    : result.uncomparableFieldNames.length > 0
                      ? t`Some changed fields cannot be safely compared. Remove or correct this row before importing.`
                      : t`This row could not be checked against existing records.`,
              };
            } else {
              delete nextErrors.__preflight;
            }

            const previousDecisions = JSON.parse(
              row.__fieldDecisions ?? '{}',
            ) as Record<string, SpreadsheetImportFieldDecision>;
            const previousSnapshots = JSON.parse(
              row.__fieldDecisionSnapshots ?? '{}',
            ) as Record<string, string>;
            const nextDecisions: Record<
              string,
              SpreadsheetImportFieldDecision
            > = Object.fromEntries(
              fields.flatMap((field) => {
                const decision = previousDecisions[field.key];
                const error = nextErrors[field.key];

                if (
                  !isDefined(error) ||
                  error.level !== 'error' ||
                  (decision === 'IGNORE_INCOMING_FIELD' &&
                    field.canIgnoreIncomingValue !== true) ||
                  (decision === 'ACCEPT_INCOMING_WARNING' &&
                    !field.fieldValidationDefinitions?.some(
                      (definition) =>
                        definition.rule === 'function' &&
                        definition.canAcceptInvalidValue?.(
                          String(row[field.key] ?? ''),
                        ) === true,
                    )) ||
                  (decision !== 'IGNORE_INCOMING_FIELD' &&
                    decision !== 'ACCEPT_INCOMING_WARNING')
                ) {
                  return [];
                }

                return [[field.key, decision]];
              }),
            );
            const nextSnapshots: Record<string, string> = {};
            const actionContext = JSON.stringify([
              result.status,
              result.existingRecordId ?? null,
            ]);

            for (const difference of result.fieldDifferences) {
              const differenceKey =
                getSpreadsheetImportFieldDifferenceKey(difference);
              const snapshot = JSON.stringify([
                difference.existingValue,
                difference.incomingValue,
                difference.sourceState,
              ]);
              nextSnapshots[differenceKey] = snapshot;
              nextDecisions[differenceKey] =
                previousSnapshots[differenceKey] === snapshot &&
                isDefined(previousDecisions[differenceKey])
                  ? previousDecisions[differenceKey]
                  : getDefaultSpreadsheetImportFieldDecision(difference);
            }

            return {
              ...row,
              __preflight: result,
              __preflightAction:
                row.__preflightActionContext === actionContext &&
                row.__preflightAction !== undefined
                  ? row.__preflightAction
                  : getDefaultSpreadsheetImportPreflightAction(result),
              __preflightActionContext: actionContext,
              __fieldDecisions: JSON.stringify(nextDecisions),
              __fieldDecisionSnapshots: JSON.stringify(nextSnapshots),
              __errors: Object.keys(nextErrors).length > 0 ? nextErrors : null,
            } as unknown as ImportedStructuredRow &
              ImportedStructuredRowMetadata;
          }),
        );
      } catch {
        if (requestId !== preflightRequestIdRef.current) {
          return;
        }

        setData((currentData) =>
          currentData.map((row) => {
            if (!eligibleRows.some(({ __index }) => __index === row.__index)) {
              return row;
            }

            const preflightError: SpreadsheetImportPreflightResult = {
              rowId: row.__index,
              status: 'PREFLIGHT_ERROR',
              matchedRecordIds: [],
              matchedConstraintIds: [],
              matchedConstraintNames: [],
              changedFieldNames: [],
              uncomparableFieldNames: [],
              fieldDifferences: [],
            };

            return {
              ...row,
              __preflight: preflightError,
              __preflightAction: 'SKIP',
              __errors: {
                ...(row.__errors ?? {}),
                __preflight: {
                  level: 'error',
                  message: t`This row could not be checked against existing records.`,
                },
              },
            } as unknown as ImportedStructuredRow &
              ImportedStructuredRowMetadata;
          }),
        );
      }
    }, 250);

    return () => {
      clearTimeout(timeoutId);
      preflightRequestIdRef.current += 1;
    };
  }, [
    duplicateResolutions,
    inconsistentDuplicateGroupIds,
    preflightSignature,
    preflightStepHook,
    t,
  ]);

  const updateRow = useCallback(
    (
      rows: typeof data,
      changedData?: RowsChangeData<(typeof data)[number]>,
    ) => {
      const changes = changedData?.indexes.reduce(
        // Todo: remove usage of react-data-grid
        (acc: any, index: any) => {
          // when data is filtered val !== actual index in data
          const realIndex = data.findIndex(
            (value) => value.__index === rows[index].__index,
          );
          acc[realIndex] = rows[index];
          return acc;
        },
        {} as Record<number, (typeof data)[number]>,
      );
      const changedRows: typeof data = Object.assign([], data, changes);
      const newData = changedRows.map((row, rowIndex) => {
        const previousRow = data[rowIndex];

        if (!isDefined(previousRow) || row === previousRow) {
          return row;
        }

        const sourceStates = JSON.parse(
          typeof previousRow.__sourceStates === 'string'
            ? previousRow.__sourceStates
            : '{}',
        ) as Record<string, 'EMPTY' | 'VALUE'>;

        for (const field of fields) {
          if (row[field.key] !== previousRow[field.key]) {
            const decisions = JSON.parse(
              previousRow.__fieldDecisions ?? '{}',
            ) as Record<string, SpreadsheetImportFieldDecision>;
            delete decisions[field.key];
            sourceStates[field.key] = getSpreadsheetImportSourceState(
              row[field.key],
            );
            row.__fieldDecisions = JSON.stringify(decisions);
            row.__preflightAction = undefined;
            row.__preflightActionContext = undefined;
          }
        }

        return {
          ...row,
          __sourceStates: JSON.stringify(sourceStates),
        } as ImportedStructuredRow & ImportedStructuredRowMetadata;
      });
      updateData(newData);
    },
    [data, fields, updateData],
  );

  const columns = useMemo(() => {
    const importedFieldColumns = generateColumns(fields)
      .map((column) => {
        const hasBeenImported =
          importedColumns.filter(
            (importColumn) =>
              (importColumn.type === SpreadsheetColumnType.matched &&
                importColumn.value === column.key) ||
              (importColumn.type === SpreadsheetColumnType.matchedSelect &&
                importColumn.value === column.key) ||
              (importColumn.type ===
                SpreadsheetColumnType.matchedSelectOptions &&
                importColumn.value === column.key) ||
              (importColumn.type === SpreadsheetColumnType.matchedCheckbox &&
                importColumn.value === column.key) ||
              column.key === 'select-row',
          ).length > 0;

        if (!hasBeenImported) return null;
        return column;
      })
      .filter(isDefined);

    return isDefined(preflightStepHook)
      ? [
          ...generatePreflightColumns({
            onActionChange: updatePreflightAction,
            onDecisionChange: updateFieldDecision,
            onValueChange: updateImportedFieldValue,
            fields,
            duplicateResolutions,
            inconsistentDuplicateGroupIds,
            onDuplicateResolutionChange: updateDuplicateResolution,
          }),
          ...importedFieldColumns,
        ]
      : importedFieldColumns;
  }, [
    fields,
    duplicateResolutions,
    inconsistentDuplicateGroupIds,
    importedColumns,
    preflightStepHook,
    updateFieldDecision,
    updateImportedFieldValue,
    updatePreflightAction,
    updateDuplicateResolution,
  ]);

  const tableData = useMemo(() => {
    if (filterByErrors) {
      return data.filter((value) => {
        return (
          (Object.values(value.__errors ?? {}).some(
            (error) => error.level === 'error',
          ) ??
            false) ||
          value.__duplicateInFile === true ||
          value.__preflight?.status === 'CONFLICT' ||
          value.__preflight?.status === 'PREFLIGHT_ERROR'
        );
      });
    }
    return data;
  }, [data, filterByErrors]);

  const importSummary = useMemo(() => {
    const summary = {
      total: data.length,
      newRows: 0,
      exactMatches: 0,
      changedRows: 0,
      duplicateRows: duplicateResolutionCounts.duplicateRows,
      unresolvedDuplicateGroups: duplicateResolutionCounts.unresolvedGroups,
      conflicts: 0,
      invalidRows: 0,
      ignoredFields: 0,
      acceptedWarnings: 0,
      skippedByUser: 0,
      toCreate: 0,
      toUpdate: 0,
      toSkip: duplicateResolutionCounts.skippedRows,
    };

    for (const row of data) {
      const validationState = getSpreadsheetImportValidationState(row, fields);
      const duplicateResolutionStatus =
        getSpreadsheetImportDuplicateResolutionStatus(
          row,
          duplicateResolutions,
          inconsistentDuplicateGroupIds,
        );
      if (
        duplicateResolutionStatus !== 'SKIP' &&
        row.__preflightAction !== 'SKIP_RECORD'
      ) {
        summary.ignoredFields += validationState.ignoredErrors.length;
        summary.acceptedWarnings += validationState.acceptedErrors.length;
      }
      const hasError = hasErrorLevelError(row, fields);
      if (
        hasError &&
        !row.__duplicateInFile &&
        row.__preflightAction !== 'SKIP_RECORD'
      ) {
        summary.invalidRows += 1;
      }

      if (
        duplicateResolutionStatus === 'UNRESOLVED' ||
        duplicateResolutionStatus === 'INCONSISTENT'
      ) {
        continue;
      }

      if (duplicateResolutionStatus === 'SKIP') {
        continue;
      }

      if (row.__preflightAction === 'SKIP_RECORD') {
        summary.toSkip += 1;
        summary.skippedByUser += 1;
        continue;
      }

      switch (row.__preflight?.status) {
        case 'NEW':
          summary.newRows += 1;
          if (!hasError && row.__preflightAction === 'CREATE') {
            summary.toCreate += 1;
          } else {
            summary.toSkip += 1;
          }
          break;
        case 'EXACT_EXISTING_MATCH':
          summary.exactMatches += 1;
          summary.toSkip += 1;
          break;
        case 'EXISTING_WITH_CHANGES': {
          summary.changedRows += 1;
          const fieldDecisions = JSON.parse(
            row.__fieldDecisions ?? '{}',
          ) as Record<string, SpreadsheetImportFieldDecision>;
          const hasAcceptedFieldChange = row.__preflight.fieldDifferences.some(
            (difference) =>
              (fieldDecisions[
                getSpreadsheetImportFieldDifferenceKey(difference)
              ] ?? getDefaultSpreadsheetImportFieldDecision(difference)) !==
              'KEEP_EXISTING',
          );

          if (
            !hasError &&
            row.__preflightAction === 'UPDATE_EXISTING' &&
            hasAcceptedFieldChange
          ) {
            summary.toUpdate += 1;
          } else {
            summary.toSkip += 1;
          }
          break;
        }
        case 'CONFLICT':
          summary.conflicts += 1;
          break;
      }
    }

    return summary;
  }, [
    data,
    duplicateResolutionCounts,
    duplicateResolutions,
    inconsistentDuplicateGroupIds,
    unresolvedDuplicateGroupCount,
    fields,
  ]);

  const pendingPreflightRows = data.filter(
    (row) =>
      shouldRunSpreadsheetImportRowPreflight(
        row,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
        fields,
      ) && !isDefined(row.__preflight),
  ).length;
  const hasPreflightFailure = data.some(
    (row) =>
      row.__preflight?.status === 'PREFLIGHT_ERROR' &&
      shouldRunSpreadsheetImportRowPreflight(
        row,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
        fields,
      ),
  );
  const importOutcome = getSpreadsheetImportOutcome({
    total: importSummary.total,
    newRows: importSummary.newRows,
    exactMatches: importSummary.exactMatches,
    changedRows: importSummary.changedRows,
    unresolvedDuplicateGroups: unresolvedDuplicateGroupCount,
    conflicts: importSummary.conflicts,
    invalidRows: importSummary.invalidRows,
    pendingPreflightRows,
    hasPreflightFailure,
  });
  const importOutcomeTitle = (() => {
    switch (importOutcome) {
      case 'PREFLIGHT_FAILED':
        return t`Existing-record check needs attention`;
      case 'CHECKING_RECORDS':
        return t`Checking records`;
      case 'NEEDS_DUPLICATE_DECISIONS':
        return t`Duplicate records need your decision`;
      case 'HAS_CONFLICTS':
        return t`Import cannot continue yet`;
      case 'NEEDS_INVALID_DATA_DECISIONS':
        return t`Some data needs your attention`;
      case 'NEEDS_CHANGE_REVIEW':
        return t`Changes detected`;
      case 'NOTHING_TO_IMPORT':
        return t`Nothing new to import`;
      case 'MIXED_READY':
        return t`Import review`;
      case 'READY_TO_IMPORT':
        return t`Ready to import`;
    }
  })();
  const importOutcomeDescription = (() => {
    switch (importOutcome) {
      case 'PREFLIGHT_FAILED':
        return t`Some records could not be checked against the CRM. Retry the check before continuing.`;
      case 'CHECKING_RECORDS':
        return t`The CRM match check is still running.`;
      case 'NEEDS_DUPLICATE_DECISIONS':
        return t`${importSummary.unresolvedDuplicateGroups} groups contain the same unique value. Choose which record to keep, or skip each group, before importing.`;
      case 'HAS_CONFLICTS':
        return t`${importSummary.conflicts} records conflict with existing CRM data. Review the affected rows before continuing.`;
      case 'NEEDS_INVALID_DATA_DECISIONS':
        return t`${importSummary.invalidRows} records contain invalid values that need a decision before import.`;
      case 'NEEDS_CHANGE_REVIEW':
        return t`${importSummary.exactMatches} records already match the CRM. ${importSummary.changedRows} records contain differences; review them before importing.`;
      case 'NOTHING_TO_IMPORT':
        return t`All ${importSummary.exactMatches} records already exist in the CRM with the same data. No records need to be created or updated.`;
      case 'MIXED_READY':
        return t`${importSummary.exactMatches} records already exist with the same data and will be skipped. ${importSummary.newRows} new records are ready to create.`;
      case 'READY_TO_IMPORT':
        return t`${importSummary.toCreate} records are ready to create and ${importSummary.toUpdate} existing records are ready to update.`;
    }
  })();

  const rowKeyGetter = useCallback(
    (row: ImportedStructuredRow & ImportedStructuredRowMetadata) => row.__index,
    [],
  );

  const submitData = async () => {
    const hasUnresolvedBlockingRow = data.some((row) => {
      if (row.__preflightAction === 'SKIP_RECORD') {
        return false;
      }

      const duplicateStatus = getSpreadsheetImportDuplicateResolutionStatus(
        row,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
      );

      return (
        duplicateStatus !== 'SKIP' &&
        (hasErrorLevelError(row, fields) ||
          row.__preflight?.status === 'CONFLICT' ||
          row.__preflight?.status === 'PREFLIGHT_ERROR')
      );
    });
    const hasPendingPreflight = data.some(
      (row) =>
        shouldRunSpreadsheetImportRowPreflight(
          row,
          duplicateResolutions,
          inconsistentDuplicateGroupIds,
          fields,
        ) && !isDefined(row.__preflight),
    );

    if (
      submissionStartedRef.current ||
      unresolvedDuplicateGroupCount > 0 ||
      hasUnresolvedBlockingRow ||
      hasPendingPreflight
    ) {
      return;
    }

    submissionStartedRef.current = true;
    const calculatedData = data.reduce(
      (acc, value) => {
        const duplicateResolutionStatus =
          getSpreadsheetImportDuplicateResolutionStatus(
            value,
            duplicateResolutions,
            inconsistentDuplicateGroupIds,
          );

        if (duplicateResolutionStatus === 'SKIP') {
          return acc;
        }

        const {
          __index,
          __errors,
          __preflight,
          __preflightAction,
          __duplicateInFile,
          __duplicateInFileGroups,
          __duplicateInFileRowNumber,
          __duplicateResolutionStatus: _duplicateResolutionStatus,
          ...values
        } = value;
        if (value.__preflightAction === 'SKIP_RECORD') {
          return acc;
        }
        const hasValidationError = hasErrorLevelError(value, fields);
        const shouldSubmit =
          !isDefined(preflightStepHook) ||
          shouldSubmitSpreadsheetImportPreflightResult({
            result: __preflight,
            action: __preflightAction,
          });

        if (hasValidationError || !shouldSubmit) {
          acc.invalidStructuredRows.push(
            values as unknown as ImportedStructuredRow,
          );
          return acc;
        }
        acc.validStructuredRows.push({
          ...values,
          __preflight,
          __preflightAction,
        } as unknown as ImportedStructuredRow);
        return acc;
      },
      {
        validStructuredRows: [] as ImportedStructuredRow[],
        invalidStructuredRows: [] as ImportedStructuredRow[],
        allStructuredRows: data.map((row) => {
          const status = getSpreadsheetImportDuplicateResolutionStatus(
            row,
            duplicateResolutions,
            inconsistentDuplicateGroupIds,
          );

          return {
            ...row,
            __duplicateResolutionStatus:
              status === 'KEEP_ONE' || status === 'SKIP' ? status : undefined,
          } as ImportedStructuredRow & ImportedStructuredRowMetadata;
        }),
      } satisfies SpreadsheetImportImportValidationResult,
    );

    hideStepBar();
    setCurrentStepState({
      type: SpreadsheetImportStepType.importData,
      recordsToImportCount: calculatedData.validStructuredRows.length,
    });

    let result: SpreadsheetImportSubmissionResult;
    try {
      result = (await onSubmit(calculatedData, file)) ?? {
        status: 'failed',
        created: 0,
        updated: 0,
        skippedExisting: 0,
        skippedPreserved: 0,
        preservationMessages: [],
        skippedDuplicateRows: 0,
        skippedManually: 0,
        notImported: calculatedData.invalidStructuredRows.length,
        failed: calculatedData.validStructuredRows.length,
        totalRows: data.length,
        errorMessage: t`The import response did not include confirmed result counts.`,
      };
    } catch {
      result = {
        status: 'failed',
        created: 0,
        updated: 0,
        skippedExisting: data.filter(
          (row) => row.__preflight?.status === 'EXACT_EXISTING_MATCH',
        ).length,
        skippedPreserved: 0,
        skippedDuplicateRows: data.filter(
          (row) =>
            getSpreadsheetImportDuplicateResolutionStatus(
              row,
              duplicateResolutions,
              inconsistentDuplicateGroupIds,
            ) === 'SKIP',
        ).length,
        skippedManually: 0,
        notImported: calculatedData.invalidStructuredRows.length,
        failed: calculatedData.validStructuredRows.length,
        totalRows: data.length,
        errorMessage: t`The import failed before its result could be confirmed.`,
      };
    }

    setCurrentStepState({
      type: SpreadsheetImportStepType.importResult,
      result,
    });
  };
  const onContinue = () => {
    if (unresolvedDuplicateGroupCount > 0) {
      enqueueDialog({
        title: t`Resolve duplicate groups first`,
        message: t`Choose one uploaded row to keep or skip all rows in every duplicate group before confirming the import.`,
        buttons: [{ title: t`OK`, role: 'confirm' }],
      });
      return;
    }

    const hasUnresolvedPreflight =
      isDefined(preflightStepHook) &&
      data.some(
        (row) =>
          shouldRunSpreadsheetImportRowPreflight(
            row,
            duplicateResolutions,
            inconsistentDuplicateGroupIds,
            fields,
          ) && !isDefined(row.__preflight),
      );

    if (hasUnresolvedPreflight) {
      enqueueDialog({
        title: t`Still checking existing records`,
        message: t`Wait for the existing-record check to finish before confirming the import.`,
        buttons: [{ title: t`OK`, role: 'confirm' }],
      });
      return;
    }

    if (hasPreflightFailure) {
      enqueueDialog({
        title: t`Existing-record check failed`,
        message: t`The import is blocked because some rows could not be checked against the CRM. Retry the check or remove the affected rows before continuing.`,
        buttons: [
          { title: t`Cancel` },
          {
            title: t`Retry check`,
            onClick: retryFailedPreflightRows,
            role: 'confirm',
          },
        ],
      });
      return;
    }

    const hasUnresolvedBlockingRows = data.some((row) => {
      const duplicateStatus = getSpreadsheetImportDuplicateResolutionStatus(
        row,
        duplicateResolutions,
        inconsistentDuplicateGroupIds,
      );

      return (
        duplicateStatus !== 'SKIP' &&
        row.__preflightAction !== 'SKIP_RECORD' &&
        hasErrorLevelError(row, fields)
      );
    });

    if (hasUnresolvedBlockingRows) {
      enqueueDialog({
        title: t`Resolve blocking issues first`,
        message: t`Correct invalid values, ignore optional fields where allowed, or skip each affected record before confirming the import.`,
        buttons: [{ title: t`Review`, role: 'confirm' }],
      });
      return;
    }

    if (importOutcome === 'NOTHING_TO_IMPORT') {
      hideStepBar();
      setCurrentStepState({
        type: SpreadsheetImportStepType.importResult,
        result: {
          status: 'completed',
          outcome: 'NOTHING_TO_IMPORT',
          created: 0,
          updated: 0,
          skippedExisting: importSummary.exactMatches,
          skippedPreserved: 0,
          skippedDuplicateRows: 0,
          skippedManually: 0,
          notImported: 0,
          failed: 0,
          totalRows: importSummary.total,
          preservationMessages: [],
          ignoredFieldValues: [],
          rowIssues: [],
        },
      });
      return;
    }

    const blockedRowCount = data.filter(
      (row) =>
        row.__preflightAction !== 'SKIP_RECORD' &&
        hasErrorLevelError(row, fields),
    ).length;
    const warningSummary =
      importSummary.ignoredFields > 0
        ? t` ${importSummary.ignoredFields} invalid optional field values will be ignored.`
        : '';
    const summaryMessage = t`${importSummary.toCreate} will be created, ${importSummary.toUpdate} existing records will be updated, and ${importSummary.toSkip} rows will be skipped (${importSummary.skippedByUser} by your choice). ${blockedRowCount} rows with errors will not be imported.${warningSummary} No unresolved blocking errors remain.`;

    enqueueDialog({
      title: t`Ready to import`,
      message: hasUnresolvedBlockingRows
        ? summaryMessage
        : t`${importSummary.toCreate} records will be created, ${importSummary.toUpdate} existing records will be updated, and ${importSummary.toSkip} rows will be skipped (${importSummary.skippedByUser} by your choice).${warningSummary} No unresolved blocking errors remain.`,
      buttons: [
        { title: t`Review` },
        {
          title:
            importSummary.toCreate + importSummary.toUpdate > 0
              ? t`Import ${importSummary.toCreate + importSummary.toUpdate} records`
              : t`Finish check`,
          variant: 'primary',
          onClick: submitData,
          role: 'confirm',
        },
      ],
    });
  };

  return (
    <>
      <ModalContent noPadding>
        <StyledContentWrapper>
          {isDefined(preflightStepHook) && (
            <StyledAnalysisSummary>
              <StyledSummaryTitle>{importOutcomeTitle}</StyledSummaryTitle>
              <span>{importOutcomeDescription}</span>
              <StyledSummaryCounts>
                <span>{t`${importSummary.total} analyzed`}</span>
                <span>{t`${importSummary.newRows} new`}</span>
                <span>{t`${importSummary.exactMatches} already match`}</span>
                <span>{t`${importSummary.changedRows} changed`}</span>
                <span>{t`${importSummary.invalidRows} invalid`}</span>
                <span>{t`${importSummary.unresolvedDuplicateGroups} duplicate groups need review`}</span>
                <span>{t`${importSummary.conflicts} conflicts`}</span>
                <span>{t`${importSummary.toCreate} to create`}</span>
                <span>{t`${importSummary.toUpdate} to update`}</span>
              </StyledSummaryCounts>
              {importSummary.ignoredFields > 0 && (
                <span>
                  {t`${importSummary.ignoredFields} invalid optional field values will be ignored.`}
                </span>
              )}
              {importSummary.acceptedWarnings > 0 && (
                <span>
                  {t`${importSummary.acceptedWarnings} invalid values will be sent to the CRM because the field permits them.`}
                </span>
              )}
              {(importSummary.invalidRows > 0 ||
                importSummary.unresolvedDuplicateGroups > 0 ||
                importSummary.conflicts > 0) && (
                <Button
                  title={t`Review rows needing attention`}
                  onClick={() => setFilterByErrors(true)}
                />
              )}
              {hasPreflightFailure && (
                <Button
                  title={t`Retry existing-record check`}
                  onClick={retryFailedPreflightRows}
                />
              )}
            </StyledAnalysisSummary>
          )}
          {filterByErrors && tableData.length === 0 ? (
            <StyledNoRowsWithErrorsContainer>
              <Trans>No rows with errors</Trans>
            </StyledNoRowsWithErrorsContainer>
          ) : (
            <StyledScrollContainer>
              <SpreadsheetImportTable
                headerRowHeight={32}
                rowHeight={(row) => (row.__duplicateInFile ? 96 : 40)}
                rowKeyGetter={rowKeyGetter}
                rows={tableData}
                onRowsChange={updateRow}
                columns={columns}
                selectedRows={selectedRows}
                onSelectedRowsChange={setSelectedRows as any} // TODO: replace 'any'
                renderers={{
                  noRowsFallback: (
                    <StyledNoRowsContainer>
                      {filterByErrors
                        ? t`No data containing errors`
                        : t`No data found`}
                    </StyledNoRowsContainer>
                  ),
                }}
              />
            </StyledScrollContainer>
          )}
          <StyledToolbar>
            <StyledErrorSwitch>
              <Switch
                aria-label={t`Show only rows with errors`}
                checked={filterByErrors}
                onCheckedChange={() => setFilterByErrors(!filterByErrors)}
                size="sm"
              />
              <StyledErrorSwitchDescription>
                <Trans>Show only rows with errors</Trans>
              </StyledErrorSwitchDescription>
            </StyledErrorSwitch>
            <StyledButtonContainer>
              <Button
                Icon={IconTrash}
                title={t`Remove`}
                accent="default"
                onClick={deleteSelectedRows}
                disabled={selectedRows.size === 0}
              />
            </StyledButtonContainer>
          </StyledToolbar>
        </StyledContentWrapper>
      </ModalContent>
      <StepNavigationButton
        onContinue={onContinue}
        onBack={onBack}
        continueTitle={t`Confirm`}
        isContinueDisabled={
          pendingPreflightRows > 0 ||
          hasPreflightFailure ||
          unresolvedDuplicateGroupCount > 0
        }
      />
    </>
  );
};
