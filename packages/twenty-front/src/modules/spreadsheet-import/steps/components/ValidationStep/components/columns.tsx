import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type Column, useRowSelection } from 'react-data-grid';
import { createPortal } from 'react-dom';

import {
  type ImportedStructuredRow,
  type SpreadsheetImportPreflightAction,
  type SpreadsheetImportFieldDecision,
  type SpreadsheetImportPreflightStatus,
  type SpreadsheetImportFields,
  type SpreadsheetImportDuplicateGroup,
  type SpreadsheetImportDuplicateResolution,
} from '@/spreadsheet-import/types';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

import camelCase from 'lodash.camelcase';
import { isDefined } from 'twenty-shared/utils';
import { AppTooltip, TooltipDelay } from 'twenty-ui/surfaces';
import { Button, Checkbox, Switch, type SelectOption } from 'twenty-ui/input';
import { Select } from '@/ui/input/components/Select';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useState } from 'react';
import { type ImportedStructuredRowMetadata } from '@/spreadsheet-import/steps/components/ValidationStep/types';
import { getSpreadsheetImportFieldDifferenceKey } from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { getDefaultSpreadsheetImportPreflightAction } from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { getSpreadsheetImportDuplicateResolutionStatus } from '@/spreadsheet-import/utils/spreadsheetImportDuplicateResolution';
import { getSpreadsheetImportValidationState } from '@/spreadsheet-import/utils/spreadsheetImportValidation';

const StyledHeaderContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  position: relative;
`;

const StyledHeaderLabel = styled.span`
  display: flex;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledCheckboxContainer = styled.div`
  align-items: center;
  box-sizing: content-box;
  display: flex;
  flex: 1;
  height: 100%;
  justify-content: center;
  line-height: 0;
  width: 100%;
`;

const StyledSwitchContainer = styled.div`
  align-items: center;
  display: flex;
  height: 100%;
`;

const StyledSwitch = styled(Switch)`
  align-self: center;
`;

const StyledInputContainer = styled.div`
  align-items: center;
  display: flex;
  min-height: 100%;
  min-width: 100%;
  padding-right: ${themeCssVariables.spacing[2]};
`;

const StyledDefaultContainer = styled.div`
  align-content: center;
  min-height: 100%;
  min-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledPreflightStatus = styled.div`
  align-content: center;
  line-height: 16px;
  min-height: 100%;
  overflow: visible;
  text-overflow: ellipsis;
  white-space: normal;
`;

const StyledDuplicateSummary = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledValidationErrorList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledValidationError = styled.div`
  overflow-wrap: anywhere;
`;

const StyledValidationErrorValue = styled.div`
  white-space: pre-wrap;
`;

const StyledInvalidFieldActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledSelectReadonlyValueContianer = styled.div`
  padding-left: ${themeCssVariables.spacing[2]};
`;

const SELECT_COLUMN_KEY = 'select-row';

const formatSafeId = (columnKey: string) => {
  return camelCase(columnKey.replace('(', '').replace(')', ''));
};

const DuplicateInFileStatus = ({
  row,
  duplicateResolutions,
  inconsistentDuplicateGroupIds,
  onDuplicateResolutionChange,
}: {
  row: ImportedStructuredRow & ImportedStructuredRowMetadata;
  duplicateResolutions: Record<string, SpreadsheetImportDuplicateResolution>;
  inconsistentDuplicateGroupIds: ReadonlySet<string>;
  onDuplicateResolutionChange: (
    groupId: string,
    resolution: SpreadsheetImportDuplicateResolution,
  ) => void;
}) => {
  const { enqueueDialog } = useDialogManager();
  const groups = JSON.parse(
    row.__duplicateInFileGroups ?? '[]',
  ) as SpreadsheetImportDuplicateGroup[];
  const resolutionStatus = getSpreadsheetImportDuplicateResolutionStatus(
    row,
    duplicateResolutions,
    inconsistentDuplicateGroupIds,
  );
  const firstGroup = groups[0];
  const currentRowNumber = Number(row.__duplicateInFileRowNumber);
  const firstOtherRow = firstGroup?.rows.find(
    (duplicateRow) => duplicateRow.rowNumber !== currentRowNumber,
  );
  const firstConflict = firstGroup?.fields
    .filter((field) => field.value !== '')
    .map((field) => `${field.label}: ${field.value}`)
    .join(', ');
  const resolutionLabel =
    resolutionStatus === 'UNRESOLVED'
      ? t`Duplicate in uploaded file — unresolved`
      : resolutionStatus === 'INCONSISTENT'
        ? t`Duplicate in uploaded file — conflicting group choices`
        : resolutionStatus === 'SKIP'
          ? groups.some(
              (group) => duplicateResolutions[group.id]?.kind === 'SKIP_ALL',
            )
            ? t`Duplicate in uploaded file — resolved; skip all`
            : t`Duplicate in uploaded file — resolved; skip row ${currentRowNumber}`
          : t`Duplicate in uploaded file — resolved; keep row ${currentRowNumber}`;
  const resolutionButtons = groups.flatMap((group) => {
    const groupLabel = group.fields.map(({ label }) => label).join(', ');

    return [
      ...group.rows.map((duplicateRow) => ({
        title: t`Keep row ${duplicateRow.rowNumber} — ${groupLabel}`,
        onClick: () =>
          onDuplicateResolutionChange(group.id, {
            kind: 'KEEP_ONE',
            rowNumber: duplicateRow.rowNumber,
          }),
        role: 'confirm' as const,
      })),
      {
        title: t`Skip all — ${groupLabel}`,
        onClick: () =>
          onDuplicateResolutionChange(group.id, { kind: 'SKIP_ALL' }),
        role: 'confirm' as const,
      },
    ];
  });

  return (
    <StyledPreflightStatus>
      <StyledDuplicateSummary>
        {resolutionLabel}
        {firstGroup?.kind === 'unique-constraint' && firstConflict
          ? ` — ${firstConflict}`
          : firstGroup?.kind === 'exact-row'
            ? ` — ${t`Exact row match`}`
            : ''}
        {firstOtherRow
          ? `; ${t`also row ${firstOtherRow.rowNumber}`}${firstOtherRow.label ? ` — ${firstOtherRow.label}` : ''}`
          : ''}
      </StyledDuplicateSummary>
      <Button
        title={t`Resolve duplicate group`}
        onClick={() =>
          enqueueDialog({
            title: t`Resolve duplicate group`,
            children: (
              <div>
                {groups.map((group, groupIndex) => (
                  <div key={`${group.kind}-${groupIndex}`}>
                    <div>
                      {group.kind === 'unique-constraint'
                        ? t`Unique constraint conflict`
                        : t`The complete imported row is identical`}
                    </div>
                    {group.fields
                      .filter((field) => field.value !== '')
                      .map((field) => (
                        <div key={`${field.label}-${field.value}`}>
                          {field.label}: {field.value}
                        </div>
                      ))}
                    <div>{t`Conflicting uploaded rows`}</div>
                    {group.rows.map((duplicateRow) => (
                      <div key={duplicateRow.rowNumber}>
                        {t`Uploaded row ${duplicateRow.rowNumber}`}
                        {duplicateRow.label ? ` — ${duplicateRow.label}` : ''}
                      </div>
                    ))}
                    <div>
                      {(() => {
                        const resolution = duplicateResolutions[group.id];

                        return resolution?.kind === 'SKIP_ALL'
                          ? t`Current decision: skip all rows`
                          : resolution?.kind === 'KEEP_ONE'
                            ? t`Current decision: keep row ${resolution.rowNumber}`
                            : t`Choose one row to keep, or skip all rows`;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            ),
            buttons: [
              ...resolutionButtons,
              { title: t`Close`, role: 'confirm' as const },
            ],
          })
        }
      />
    </StyledPreflightStatus>
  );
};

const InvalidFieldReview = ({
  fieldKey,
  fieldLabel,
  incomingValue,
  errorMessage,
  rowId,
  decision,
  decisionOptions,
  canIgnoreIncomingValue,
  hasExistingRecord,
  onDecisionChange,
  onValueChange,
}: {
  fieldKey: string;
  fieldLabel: string;
  incomingValue: string;
  errorMessage: string;
  rowId: string;
  decision?: SpreadsheetImportFieldDecision;
  decisionOptions: SelectOption<SpreadsheetImportFieldDecision>[];
  canIgnoreIncomingValue: boolean;
  hasExistingRecord: boolean;
  onDecisionChange: (
    rowId: string,
    fieldKey: string,
    decision: SpreadsheetImportFieldDecision,
  ) => void;
  onValueChange: (rowId: string, fieldKey: string, value: string) => void;
}) => {
  const [correctedValue, setCorrectedValue] = useState(incomingValue);
  const [currentDecision, setCurrentDecision] = useState(decision);
  const [wasCorrected, setWasCorrected] = useState(false);

  return (
    <StyledValidationError key={fieldKey}>
      <div>
        {t`Field`}: {fieldLabel}
      </div>
      <StyledValidationErrorValue>
        {t`Excel value`}: {incomingValue || t`Empty`}
      </StyledValidationErrorValue>
      <div>
        {t`Reason`}: {errorMessage}
      </div>
      <StyledInvalidFieldActions>
        <SettingsTextInput
          instanceId={`spreadsheet-import-correct-${rowId}-${fieldKey}`}
          aria-label={t`Correct ${fieldLabel}`}
          label={t`Correct value`}
          value={correctedValue}
          onChange={(value) => {
            setCorrectedValue(value);
            setWasCorrected(false);
          }}
          fullWidth
        />
        <Button
          title={t`Use corrected value`}
          onClick={() => {
            onValueChange(rowId, fieldKey, correctedValue);
            setCurrentDecision(undefined);
            setWasCorrected(true);
          }}
          disabled={
            correctedValue.length === 0 ||
            correctedValue === incomingValue ||
            wasCorrected
          }
        />
        <div>
          {wasCorrected
            ? t`The corrected value was submitted for validation.`
            : t`Edit this value and validate it again.`}
        </div>
        {decisionOptions.length > 0 && (
          <StyledInvalidFieldActions>
            {decisionOptions.map((decisionOption) => (
              <Button
                key={decisionOption.value}
                title={decisionOption.label}
                onClick={() => {
                  setCurrentDecision(decisionOption.value);
                  onDecisionChange(rowId, fieldKey, decisionOption.value);
                }}
                disabled={currentDecision === decisionOption.value}
              />
            ))}
          </StyledInvalidFieldActions>
        )}
        {currentDecision === 'IGNORE_INCOMING_FIELD' && (
          <div>
            {hasExistingRecord
              ? t`This incoming value will be ignored. The existing CRM value will be preserved.`
              : t`This field will not be imported. The rest of the record will still be imported.`}
          </div>
        )}
        {currentDecision === 'ACCEPT_INCOMING_WARNING' && (
          <div>{t`This value will be sent to the CRM for storage.`}</div>
        )}
        {!canIgnoreIncomingValue && decisionOptions.length === 0 && (
          <div>{t`This value cannot be stored in this CRM field.`}</div>
        )}
      </StyledInvalidFieldActions>
    </StyledValidationError>
  );
};

const ValidationErrorsButton = ({
  row,
  fields,
  onDecisionChange,
  onActionChange,
  onValueChange,
  showPreflightIssue = false,
  hasBlockingErrors = false,
}: {
  row: ImportedStructuredRow & ImportedStructuredRowMetadata;
  fields: SpreadsheetImportFields;
  onDecisionChange: (
    rowId: string,
    fieldKey: string,
    decision: SpreadsheetImportFieldDecision,
  ) => void;
  onActionChange: (
    rowId: string,
    action: SpreadsheetImportPreflightAction,
  ) => void;
  onValueChange: (rowId: string, fieldKey: string, value: string) => void;
  showPreflightIssue?: boolean;
  hasBlockingErrors?: boolean;
}) => {
  const { enqueueDialog } = useDialogManager();
  const validationErrors = Object.entries(row.__errors ?? {}).filter(
    ([fieldKey, error]) =>
      !fieldKey.startsWith('__') &&
      fields.some((field) => field.key === fieldKey) &&
      error.level === 'error',
  );
  const decisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
    string,
    SpreadsheetImportFieldDecision
  >;

  const isSkipped = row.__preflightAction === 'SKIP_RECORD';
  const hasSavedFieldDecision = Object.values(decisions).some(
    (decision) =>
      decision === 'IGNORE_INCOMING_FIELD' ||
      decision === 'ACCEPT_INCOMING_WARNING',
  );

  if (validationErrors.length === 0 && !isSkipped && !showPreflightIssue) {
    return null;
  }

  const recordLabelField = fields.find((field) => field.isLabelIdentifier);
  const recordLabel = recordLabelField
    ? String(row[recordLabelField.key] ?? '').trim()
    : '';
  const recordName = recordLabel || t`record`;

  return (
    <Button
      title={
        isSkipped || (hasSavedFieldDecision && !hasBlockingErrors)
          ? t`Change decision`
          : showPreflightIssue
            ? t`Review conflict`
            : hasSavedFieldDecision
              ? t`Review remaining issues`
              : t`Review & decide`
      }
      onClick={() =>
        enqueueDialog({
          title: t`Invalid data`,
          children: (
            <StyledValidationErrorList>
              {recordLabel && (
                <div>
                  {recordLabelField?.label ?? t`Record`}: {recordLabel}
                </div>
              )}
              {showPreflightIssue && (
                <div>
                  {row.__errors?.__preflight?.message ??
                    t`This record could not be matched safely with existing CRM data.`}
                </div>
              )}
              {validationErrors.length === 0 && !showPreflightIssue && (
                <div>{t`${recordName} will be skipped and will not be created or updated.`}</div>
              )}
              {(row.__preflight?.matchedConstraintNames?.length ?? 0) > 0 && (
                <div>
                  {t`Matching unique fields`}:{' '}
                  {row.__preflight?.matchedConstraintNames?.join(', ')}
                </div>
              )}
              {validationErrors.map(([fieldKey, error]) => {
                const field = fields.find(({ key }) => key === fieldKey);
                const incomingValue = row[fieldKey];
                const displayedValue =
                  incomingValue === undefined ||
                  incomingValue === null ||
                  incomingValue === ''
                    ? t`Empty`
                    : typeof incomingValue === 'object'
                      ? JSON.stringify(incomingValue)
                      : String(incomingValue);
                const canAccept =
                  field?.fieldValidationDefinitions?.some(
                    (definition) =>
                      definition.rule === 'function' &&
                      definition.canAcceptInvalidValue?.(
                        String(incomingValue ?? ''),
                      ) === true,
                  ) === true;
                const decisionOptions: SelectOption<SpreadsheetImportFieldDecision>[] =
                  [
                    ...(field?.canIgnoreIncomingValue
                      ? [
                          {
                            value: 'IGNORE_INCOMING_FIELD' as const,
                            label: t`Ignore ${field?.label ?? fieldKey} and import the record`,
                          },
                        ]
                      : []),
                    ...(canAccept
                      ? [
                          {
                            value: 'ACCEPT_INCOMING_WARNING' as const,
                            label: t`Keep incoming value`,
                          },
                        ]
                      : []),
                  ];

                return (
                  <InvalidFieldReview
                    key={fieldKey}
                    fieldKey={fieldKey}
                    fieldLabel={field?.label ?? fieldKey}
                    incomingValue={
                      displayedValue === t`Empty` ? '' : displayedValue
                    }
                    errorMessage={error.message}
                    rowId={row.__index}
                    decision={decisions[fieldKey]}
                    decisionOptions={decisionOptions}
                    canIgnoreIncomingValue={
                      field?.canIgnoreIncomingValue === true
                    }
                    hasExistingRecord={isDefined(
                      row.__preflight?.existingRecordId,
                    )}
                    onDecisionChange={onDecisionChange}
                    onValueChange={onValueChange}
                  />
                );
              })}
              {validationErrors.length > 0 && (
                <div>{t`Skip ${recordName}: this record will not be created or updated.`}</div>
              )}
            </StyledValidationErrorList>
          ),
          buttons: [
            ...(isSkipped
              ? [
                  {
                    title: t`Keep ${recordName} in the import`,
                    onClick: () =>
                      onActionChange(
                        row.__index,
                        row.__preflight
                          ? getDefaultSpreadsheetImportPreflightAction(
                              row.__preflight,
                            )
                          : 'CREATE',
                      ),
                  },
                ]
              : [
                  {
                    title: t`Skip ${recordName}`,
                    onClick: () => onActionChange(row.__index, 'SKIP_RECORD'),
                  },
                ]),
            { title: t`Close`, role: 'confirm' },
          ],
        })
      }
    />
  );
};

export const generateColumns = (
  fields: SpreadsheetImportFields,
): Column<ImportedStructuredRow & ImportedStructuredRowMetadata>[] => [
  {
    key: SELECT_COLUMN_KEY,
    name: '',
    width: 35,
    minWidth: 35,
    maxWidth: 35,
    resizable: false,
    sortable: false,
    frozen: true,
    renderCell: (props: any) => {
      // oxlint-disable-next-line  react-hooks/rules-of-hooks
      const { isRowSelected, onRowSelectionChange } = useRowSelection();

      return (
        <StyledCheckboxContainer>
          <Checkbox
            aria-label={t`Select`}
            checked={isRowSelected}
            variant={'soft'}
            onCheckedChange={(isChecked, eventDetails) => {
              onRowSelectionChange({
                row: props.row,
                checked: isChecked,
                isShiftClick:
                  'shiftKey' in eventDetails.event &&
                  eventDetails.event.shiftKey === true,
              });
            }}
          />
        </StyledCheckboxContainer>
      );
    },
  },
  ...fields.map(
    (
      column,
    ): Column<ImportedStructuredRow & ImportedStructuredRowMetadata> => ({
      key: column.key,
      name: column.label,
      minWidth: 150,
      resizable: true,
      renderHeaderCell: () => (
        <StyledHeaderContainer>
          <StyledHeaderLabel id={formatSafeId(column.key)}>
            {column.label}
          </StyledHeaderLabel>
          <>
            {column.description &&
              createPortal(
                <AppTooltip
                  anchorSelect={`#${formatSafeId(column.key)}`}
                  place="top"
                  title={column.description}
                />,
                document.body,
              )}
          </>
        </StyledHeaderContainer>
      ),
      editable: column.fieldType.type !== 'checkbox',
      // Todo: remove usage of react-data-grid
      renderEditCell: ({ row, onRowChange, onClose }: any) => {
        const columnKey = column.key as keyof (ImportedStructuredRow &
          ImportedStructuredRowMetadata);
        let component;

        switch (column.fieldType.type) {
          case 'select': {
            component = (
              <StyledSelectReadonlyValueContianer>
                {row[columnKey]}
              </StyledSelectReadonlyValueContianer>
            );
            break;
          }
          default:
            component = (
              <SettingsTextInput
                instanceId={`validation-${column.key}-${row.__index}`}
                value={row[columnKey] as string}
                onChange={(value: string) => {
                  onRowChange({ ...row, [columnKey]: value });
                }}
                autoFocus={true}
                onBlur={() => onClose(true)}
              />
            );
        }

        return <StyledInputContainer>{component}</StyledInputContainer>;
      },
      // Todo: remove usage of react-data-grid
      renderCell: ({ row, onRowChange }: { row: any; onRowChange: any }) => {
        const columnKey = column.key as keyof (ImportedStructuredRow &
          ImportedStructuredRowMetadata);
        let component;

        switch (column.fieldType.type) {
          case 'checkbox':
            component = (
              <StyledSwitchContainer
                id={formatSafeId(`${columnKey}-${row.__index}`)}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <StyledSwitch
                  aria-label={column.label}
                  checked={row[columnKey] as boolean}
                  onCheckedChange={() => {
                    onRowChange({
                      ...row,
                      [columnKey]: !row[columnKey],
                    });
                  }}
                />
              </StyledSwitchContainer>
            );
            break;
          case 'select':
            component = (
              <StyledDefaultContainer
                id={formatSafeId(`${columnKey}-${row.__index}`)}
              >
                {column.fieldType.options.find(
                  (option) => option.value === row[columnKey],
                )?.label || null}
              </StyledDefaultContainer>
            );
            break;
          default:
            component = (
              <StyledDefaultContainer
                id={formatSafeId(`${columnKey}-${row.__index}`)}
              >
                {row[columnKey]}
              </StyledDefaultContainer>
            );
        }

        if (isDefined(row.__errors?.[columnKey])) {
          return (
            <>
              {component}
              {createPortal(
                <AppTooltip
                  anchorSelect={`#${formatSafeId(`${columnKey}-${row.__index}`)}`}
                  place="top"
                  title={row.__errors?.[columnKey]?.message}
                  delay={TooltipDelay.shortDelay}
                />,
                document.body,
              )}
            </>
          );
        }

        return component;
      },
      cellClass: (row: ImportedStructuredRowMetadata) => {
        switch (row.__errors?.[column.key]?.level) {
          case 'error':
            return 'rdg-cell-error';
          case 'warning':
            return 'rdg-cell-warning';
          case 'info':
            return 'rdg-cell-info';
          default:
            return '';
        }
      },
    }),
  ),
];

const preflightStatusLabels: Record<SpreadsheetImportPreflightStatus, string> =
  {
    NEW: t`New — will be created`,
    EXACT_EXISTING_MATCH: t`Already exists — same data`,
    EXISTING_WITH_CHANGES: t`Already exists — differences found`,
    CONFLICT: t`Conflict`,
    PREFLIGHT_ERROR: t`Check failed`,
  };

const preflightActionOptions: SelectOption<SpreadsheetImportPreflightAction>[] =
  [
    { value: 'CREATE', label: t`Create` },
    { value: 'SKIP_RECORD', label: t`Skip this record` },
    { value: 'UPDATE_EXISTING', label: t`Update existing` },
  ];

const fieldDecisionOptions: SelectOption<SpreadsheetImportFieldDecision>[] = [
  { value: 'KEEP_EXISTING', label: t`Keep existing` },
  { value: 'USE_INCOMING', label: t`Use incoming` },
  { value: 'CLEAR', label: t`Clear` },
];

const formatReviewValue = (value: unknown, isEmpty: boolean) => {
  if (isEmpty) {
    return t`Empty`;
  }

  if (value === null) {
    return t`Empty`;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const getReviewFieldLabel = (
  difference: NonNullable<
    ImportedStructuredRowMetadata['__preflight']
  >['fieldDifferences'][number],
  fields: SpreadsheetImportFields,
) =>
  fields.find(
    (field) =>
      field.fieldMetadataItemId === difference.fieldMetadataId &&
      field.compositeSubFieldKey === difference.subFieldPath[0],
  )?.label ??
  fields.find(
    (field) => field.fieldMetadataItemId === difference.fieldMetadataId,
  )?.label ??
  difference.fieldName;

const getPreflightCellClass = (
  status: SpreadsheetImportPreflightStatus | undefined,
) => {
  switch (status) {
    case 'CONFLICT':
    case 'PREFLIGHT_ERROR':
      return 'rdg-cell-error';
    case 'EXISTING_WITH_CHANGES':
      return 'rdg-cell-warning';
    case 'EXACT_EXISTING_MATCH':
      return 'rdg-cell-info';
    default:
      return '';
  }
};

export const generatePreflightColumns = ({
  onActionChange,
  onDecisionChange,
  onValueChange = () => {},
  fields,
  duplicateResolutions = {},
  inconsistentDuplicateGroupIds = new Set<string>(),
  onDuplicateResolutionChange = () => {},
}: {
  onActionChange: (
    rowId: string,
    action: SpreadsheetImportPreflightAction,
  ) => void;
  onDecisionChange: (
    rowId: string,
    differenceKey: string,
    decision: SpreadsheetImportFieldDecision,
  ) => void;
  onValueChange?: (rowId: string, fieldKey: string, value: string) => void;
  fields: SpreadsheetImportFields;
  duplicateResolutions?: Record<string, SpreadsheetImportDuplicateResolution>;
  inconsistentDuplicateGroupIds?: ReadonlySet<string>;
  onDuplicateResolutionChange?: (
    groupId: string,
    resolution: SpreadsheetImportDuplicateResolution,
  ) => void;
}): Column<ImportedStructuredRow & ImportedStructuredRowMetadata>[] => [
  {
    key: '__preflight-status',
    name: t`Existing record`,
    minWidth: 240,
    resizable: true,
    renderCell: ({ row }) => {
      const preflight = row.__preflight;
      const validationState = getSpreadsheetImportValidationState(row, fields);
      const hasValidationErrors = Object.entries(row.__errors ?? {}).some(
        ([fieldKey, error]) =>
          fieldKey !== '__preflight' && error.level === 'error',
      );

      if (row.__preflightAction === 'SKIP_RECORD') {
        return (
          <StyledPreflightStatus>{t`Skipped by you`}</StyledPreflightStatus>
        );
      }

      if (row.__duplicateInFile) {
        return (
          <DuplicateInFileStatus
            row={row}
            duplicateResolutions={duplicateResolutions}
            inconsistentDuplicateGroupIds={inconsistentDuplicateGroupIds}
            onDuplicateResolutionChange={onDuplicateResolutionChange}
          />
        );
      }

      if (preflight?.status === 'CONFLICT') {
        return (
          <StyledPreflightStatus>
            {row.__errors?.__preflight?.message ??
              t`Unique identifiers match different CRM records.`}
          </StyledPreflightStatus>
        );
      }

      if (preflight?.status === 'PREFLIGHT_ERROR') {
        return (
          <StyledPreflightStatus>{t`Existing-record check failed`}</StyledPreflightStatus>
        );
      }

      if (validationState.blockingErrors.length > 0) {
        return <StyledPreflightStatus>{t`Invalid`}</StyledPreflightStatus>;
      }

      if (hasValidationErrors) {
        return (
          <StyledPreflightStatus>{t`Invalid data â€” resolved`}</StyledPreflightStatus>
        );
      }

      if (!isDefined(preflight)) {
        return <StyledPreflightStatus>{t`Checking...`}</StyledPreflightStatus>;
      }

      const statusLabel = preflightStatusLabels[preflight.status];

      return (
        <StyledPreflightStatus title={statusLabel}>
          {statusLabel}
        </StyledPreflightStatus>
      );
    },
    cellClass: (row) => {
      if (row.__duplicateInFile) {
        const duplicateStatus = getSpreadsheetImportDuplicateResolutionStatus(
          row,
          duplicateResolutions,
          inconsistentDuplicateGroupIds,
        );

        return duplicateStatus === 'UNRESOLVED' ||
          duplicateStatus === 'INCONSISTENT'
          ? 'rdg-cell-error'
          : duplicateStatus === 'SKIP'
            ? 'rdg-cell-info'
            : 'rdg-cell-warning';
      }

      return getSpreadsheetImportValidationState(row, fields).blockingErrors
        .length > 0
        ? 'rdg-cell-error'
        : getPreflightCellClass(row.__preflight?.status);
    },
  },
  {
    key: '__preflight-review',
    name: t`Review fields`,
    minWidth: 180,
    resizable: true,
    renderCell: ({ row }) => {
      const differences = row.__preflight?.fieldDifferences ?? [];

      if (differences.length === 0) {
        return <StyledDefaultContainer>—</StyledDefaultContainer>;
      }

      const decisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
        string,
        SpreadsheetImportFieldDecision
      >;

      return (
        <PreflightReviewButton
          rowId={row.__index}
          differences={differences}
          decisions={decisions}
          fields={fields}
          onDecisionChange={onDecisionChange}
        />
      );
    },
  },
  {
    key: '__preflight-action',
    name: t`Action`,
    minWidth: 225,
    resizable: false,
    renderCell: ({ row }) => {
      const preflight = row.__preflight;
      const validationState = getSpreadsheetImportValidationState(row, fields);
      const fieldDecisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
        string,
        SpreadsheetImportFieldDecision
      >;
      const hasInvalidFieldDecisions = Object.values(fieldDecisions).some(
        (decision) =>
          decision === 'IGNORE_INCOMING_FIELD' ||
          decision === 'ACCEPT_INCOMING_WARNING',
      );
      const ignoredFieldLabels = Object.entries(fieldDecisions)
        .filter(([, decision]) => decision === 'IGNORE_INCOMING_FIELD')
        .map(([fieldKey]) => fields.find(({ key }) => key === fieldKey)?.label)
        .filter(isDefined);

      if (row.__preflightAction === 'SKIP_RECORD') {
        return (
          <ValidationErrorsButton
            row={row}
            fields={fields}
            onDecisionChange={onDecisionChange}
            onActionChange={onActionChange}
            onValueChange={onValueChange}
          />
        );
      }

      if (row.__duplicateInFile) {
        const duplicateStatus = getSpreadsheetImportDuplicateResolutionStatus(
          row,
          duplicateResolutions,
          inconsistentDuplicateGroupIds,
        );

        if (duplicateStatus === 'UNRESOLVED') {
          return (
            <StyledDefaultContainer>
              {t`Resolve duplicate group`}
            </StyledDefaultContainer>
          );
        }

        if (duplicateStatus === 'INCONSISTENT') {
          return (
            <StyledDefaultContainer>
              {t`Resolve overlapping duplicate groups`}
            </StyledDefaultContainer>
          );
        }

        if (duplicateStatus === 'SKIP') {
          return (
            <StyledDefaultContainer>
              {t`Skip — duplicate-group decision`}
            </StyledDefaultContainer>
          );
        }
      }

      if (
        preflight?.status === 'CONFLICT' ||
        preflight?.status === 'PREFLIGHT_ERROR'
      ) {
        return (
          <ValidationErrorsButton
            row={row}
            fields={fields}
            onDecisionChange={onDecisionChange}
            onActionChange={onActionChange}
            onValueChange={onValueChange}
            showPreflightIssue
          />
        );
      }

      if (validationState.blockingErrors.length > 0) {
        return (
          <div>
            {ignoredFieldLabels.length > 0 && (
              <StyledDefaultContainer>
                {t`${ignoredFieldLabels.join(', ')} ignored`}
              </StyledDefaultContainer>
            )}
            <ValidationErrorsButton
              row={row}
              fields={fields}
              onDecisionChange={onDecisionChange}
              onActionChange={onActionChange}
              onValueChange={onValueChange}
              hasBlockingErrors
            />
          </div>
        );
      }

      if (hasInvalidFieldDecisions) {
        return (
          <div>
            <StyledDefaultContainer>
              {ignoredFieldLabels.length > 0
                ? t`${ignoredFieldLabels.join(', ')} ignored`
                : t`Invalid value accepted`}
            </StyledDefaultContainer>
            <ValidationErrorsButton
              row={row}
              fields={fields}
              onDecisionChange={onDecisionChange}
              onActionChange={onActionChange}
              onValueChange={onValueChange}
            />
          </div>
        );
      }

      if (!isDefined(preflight)) {
        return (
          <StyledDefaultContainer>{t`Checking...`}</StyledDefaultContainer>
        );
      }

      if (
        preflight.status === 'NEW' ||
        (preflight.status === 'EXISTING_WITH_CHANGES' &&
          preflight.uncomparableFieldNames.length === 0)
      ) {
        return (
          <Select
            dropdownId={`spreadsheet-import-action-${row.__index}`}
            options={preflightActionOptions.filter((option) =>
              preflight.status === 'NEW'
                ? option.value !== 'UPDATE_EXISTING'
                : option.value !== 'CREATE',
            )}
            value={
              row.__preflightAction ??
              (preflight.status === 'NEW' ? 'CREATE' : 'SKIP_EXISTING')
            }
            onChange={(action) => onActionChange(row.__index, action)}
            selectSizeVariant="small"
            fullWidth
            isDropdownInModal
          />
        );
      }

      const actionLabel =
        preflight.status === 'EXACT_EXISTING_MATCH'
          ? t`No CRM changes needed — already exists`
          : t`Resolve or remove`;

      return <StyledDefaultContainer>{actionLabel}</StyledDefaultContainer>;
    },
    cellClass: (row) => getPreflightCellClass(row.__preflight?.status),
  },
];

const PreflightReviewButton = ({
  rowId,
  differences,
  decisions,
  fields,
  onDecisionChange,
}: {
  rowId: string;
  differences: NonNullable<
    ImportedStructuredRowMetadata['__preflight']
  >['fieldDifferences'];
  decisions: Record<string, SpreadsheetImportFieldDecision>;
  fields: SpreadsheetImportFields;
  onDecisionChange: (
    rowId: string,
    differenceKey: string,
    decision: SpreadsheetImportFieldDecision,
  ) => void;
}) => {
  const { enqueueDialog } = useDialogManager();

  return (
    <Button
      title={t`View differences`}
      onClick={() =>
        enqueueDialog({
          title: t`Existing CRM values and Excel values`,
          message: t`Review each changed field. Blank Excel cells keep the CRM value unless you explicitly choose to clear it.`,
          children: (
            <div>
              {differences.map((difference) => {
                const differenceKey =
                  getSpreadsheetImportFieldDifferenceKey(difference);
                const decision = decisions[differenceKey] ?? 'KEEP_EXISTING';
                const options = fieldDecisionOptions.filter(
                  (option) =>
                    (option.value !== 'CLEAR' || difference.clearAllowed) &&
                    (difference.sourceState !== 'EMPTY' ||
                      option.value !== 'USE_INCOMING'),
                );

                return (
                  <div key={differenceKey}>
                    <div>{getReviewFieldLabel(difference, fields)}</div>
                    <div>
                      {t`CRM value`}:{' '}
                      {formatReviewValue(
                        difference.existingValue,
                        difference.existingValue === null ||
                          difference.existingValue === undefined ||
                          difference.existingValue === '',
                      )}
                    </div>
                    <div>
                      {t`Excel value`}:{' '}
                      {formatReviewValue(
                        difference.incomingValue,
                        difference.sourceState === 'EMPTY',
                      )}
                    </div>
                    <Select
                      dropdownId={`spreadsheet-import-field-${rowId}-${differenceKey}`}
                      options={options}
                      value={decision}
                      onChange={(nextDecision) =>
                        onDecisionChange(rowId, differenceKey, nextDecision)
                      }
                      selectSizeVariant="small"
                      fullWidth
                      isDropdownInModal
                    />
                  </div>
                );
              })}
            </div>
          ),
          buttons: [{ title: t`Close`, role: 'confirm' }],
        })
      }
    />
  );
};
