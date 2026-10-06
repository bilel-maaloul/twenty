import gql from 'graphql-tag';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useGenerateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject';
import { useBatchCreateManyRecords } from '@/object-record/hooks/useBatchCreateManyRecords';
import { BatchCreateManyRecordsError } from '@/object-record/hooks/useBatchCreateManyRecords';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { buildRecordFromImportedStructuredRow } from '@/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow';
import {
  compileSpreadsheetImportFieldDecisions,
  hasEffectiveSpreadsheetImportUpdate,
} from '@/object-record/spreadsheet-import/utils/compileSpreadsheetImportFieldDecisions';
import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';
import { getSpreadsheetImportHeaderDefinitions } from '@/object-record/spreadsheet-import/utils/getSpreadsheetImportHeaderDefinitions';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { getCompositeSubFieldKey } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetCompositeSubFieldKey';
import { SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsCompositeFieldTypeConfigs';
import { getSpreadsheetExportFieldMetadataItems } from '@/spreadsheet/utils/getSpreadsheetExportFieldMetadataItems';
import { SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE } from '@/spreadsheet-import/constants/SpreadsheetImportCreateRecordsBatchSize';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { spreadsheetImportCreatedRecordsProgressState } from '@/spreadsheet-import/states/spreadsheetImportCreatedRecordsProgressState';
import { type SpreadsheetImportDialogOptions } from '@/spreadsheet-import/types';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types';
import { type SpreadsheetImportField } from '@/spreadsheet-import/types';
import { type SpreadsheetImportPreflightResult } from '@/spreadsheet-import/types';
import { getSpreadsheetImportFieldDifferenceKey } from '@/spreadsheet-import/utils/spreadsheetImportPreflight';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import {
  capitalize,
  getUniqueConstraintsFields,
  isDefined,
} from 'twenty-shared/utils';
import camelCase from 'lodash.camelcase';
import { z } from 'zod';
import { t } from '@lingui/core/macro';

const preflightResultSchema = z.object({
  rowId: z.string(),
  status: z.enum([
    'NEW',
    'EXACT_EXISTING_MATCH',
    'EXISTING_WITH_CHANGES',
    'CONFLICT',
  ]),
  existingRecordId: z.string().optional(),
  matchedRecordIds: z.array(z.string()),
  matchedConstraintIds: z.array(z.string()),
  matchedConstraintNames: z.array(z.string()),
  changedFieldNames: z.array(z.string()),
  uncomparableFieldNames: z.array(z.string()),
  fieldDifferences: z.array(
    z.object({
      fieldMetadataId: z.string(),
      fieldName: z.string(),
      subFieldPath: z.array(z.string()),
      existingValue: z.unknown(),
      incomingValue: z.unknown(),
      sourceState: z.enum(['EMPTY', 'VALUE']),
      clearAllowed: z.boolean(),
      comparable: z.boolean(),
    }),
  ),
});

const getPreflightResolverName = (objectNameSingular: string) =>
  `${camelCase(objectNameSingular)}ImportPreflight`;

const buildPreflightQuery = (objectNameSingular: string) => {
  const objectInputTypeName = `${capitalize(objectNameSingular)}CreateInput`;
  const resolverName = getPreflightResolverName(objectNameSingular);

  return gql`
    query Preflight${capitalize(objectNameSingular)}Import(
      $data: [${objectInputTypeName}!]!
      $rowIds: [String!]!
      $sourceStates: [JSON!]!
    ) {
      ${resolverName}(data: $data, rowIds: $rowIds, sourceStates: $sourceStates)
    }
  `;
};

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectMetadataItems } = useObjectMetadataItems();
  const { currentView } = useGetCurrentViewOnly();

  const spreadsheetExportFieldMetadataItems =
    isDefined(currentView) &&
    currentView.objectMetadataId === objectMetadataItem.id
      ? getSpreadsheetExportFieldMetadataItems({
          objectMetadataItem,
          recordFields: currentView.viewFields.map((viewField) => ({
            fieldMetadataItemId: viewField.fieldMetadataId,
            isVisible: viewField.isVisible,
            position: viewField.position,
          })),
        })
      : getSpreadsheetExportFieldMetadataItems({ objectMetadataItem });

  const setSpreadsheetImportCreatedRecordsProgress = useSetAtomState(
    spreadsheetImportCreatedRecordsProgressState,
  );

  const abortController = new AbortController();

  const { recordGqlFields } = useGenerateDepthRecordGqlFieldsFromObject({
    objectNameSingular,
    depth: 0,
  });

  const { batchCreateManyRecords } = useBatchCreateManyRecords({
    objectNameSingular,
    recordGqlFields,
    mutationBatchSize: SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE,
    setBatchedRecordsCount: setSpreadsheetImportCreatedRecordsProgress,
    abortController,
    skipPostOptimisticEffect: true,
  });

  const openObjectRecordsSpreadsheetImportDialog = (
    options?: Omit<
      SpreadsheetImportDialogOptions,
      'fields' | 'isOpen' | 'onClose'
    >,
  ) => {
    const filteredFieldMetadataItemsToImport =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        objectMetadataItem.updatableFields,
      );
    const idFieldMetadataItem = objectMetadataItem.fields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'id',
    );
    const availableFieldMetadataItemsToImport =
      idFieldMetadataItem &&
      !filteredFieldMetadataItemsToImport.some(
        (fieldMetadataItem) => fieldMetadataItem.id === idFieldMetadataItem.id,
      )
        ? [...filteredFieldMetadataItemsToImport, idFieldMetadataItem]
        : filteredFieldMetadataItemsToImport;

    const uniqueImportFieldKeys = new Set(
      getUniqueConstraintsFields<FieldMetadataItem, EnrichedObjectMetadataItem>(
        objectMetadataItem,
      ).flatMap((uniqueConstraintFields) =>
        uniqueConstraintFields.flatMap((fieldMetadataItem) =>
          isCompositeFieldType(fieldMetadataItem.type)
            ? SETTINGS_COMPOSITE_FIELD_TYPE_CONFIGS[
                fieldMetadataItem.type
              ].subFields
                .filter(
                  ({ isIncludedInUniqueConstraint }) =>
                    isIncludedInUniqueConstraint,
                )
                .map(({ subFieldName }) =>
                  getCompositeSubFieldKey(fieldMetadataItem, subFieldName),
                )
            : [fieldMetadataItem.name],
        ),
      ),
    );
    const spreadsheetImportFields = buildSpreadsheetImportFields(
      availableFieldMetadataItemsToImport,
    ).map((field) => {
      const fieldMetadataItem = objectMetadataItem.fields.find(
        ({ id }) => id === field.fieldMetadataItemId,
      );
      const isUniqueConstraintField =
        uniqueImportFieldKeys.has(field.key) ||
        field.fieldValidationDefinitions?.some(
          (definition) => definition.rule === 'unique',
        ) === true;
      const isRequiredField =
        fieldMetadataItem?.isNullable === false ||
        field.fieldValidationDefinitions?.some(
          (definition) => definition.rule === 'required',
        ) === true;
      const cannotIgnoreIncomingReason: SpreadsheetImportField['cannotIgnoreIncomingReason'] =
        field.isRelationConnectField
          ? 'relation'
          : isUniqueConstraintField
            ? 'unique'
            : isRequiredField
              ? 'required'
              : undefined;

      return {
        ...field,
        isLabelIdentifier:
          field.fieldMetadataItemId ===
          objectMetadataItem.labelIdentifierFieldMetadataId,
        canIgnoreIncomingValue: cannotIgnoreIncomingReason === undefined,
        cannotIgnoreIncomingReason,
      };
    });
    const spreadsheetImportHeaderDefinitions =
      getSpreadsheetImportHeaderDefinitions({
        fieldMetadataItems: spreadsheetExportFieldMetadataItems,
        objectMetadataItems,
        spreadsheetImportFields,
      });

    const buildRecordInput = (record: ImportedStructuredRow) => {
      const recordInput = compileSpreadsheetImportFieldDecisions({
        recordInput: buildRecordFromImportedStructuredRow({
          importedStructuredRow: record,
          fieldMetadataItems: availableFieldMetadataItemsToImport,
          spreadsheetImportFields,
        }) as Record<string, unknown>,
        preflight: (
          record as ImportedStructuredRow & {
            __preflight?: SpreadsheetImportPreflightResult;
          }
        ).__preflight,
        action: (
          record as ImportedStructuredRow & {
            __preflightAction?: string;
          }
        ).__preflightAction,
        decisions: JSON.parse(
          (
            record as ImportedStructuredRow & {
              __fieldDecisions?: string;
            }
          ).__fieldDecisions ?? '{}',
        ),
        fields: spreadsheetImportFields,
      });

      return sanitizeRecordInput({
        objectMetadataItem,
        recordInput: recordInput as never,
      });
    };

    const preflightStepHook: NonNullable<
      SpreadsheetImportDialogOptions['preflightStepHook']
    > = async (rows) => {
      const preflightQuery = buildPreflightQuery(
        objectMetadataItem.nameSingular,
      );
      const results: SpreadsheetImportPreflightResult[] = [];
      const fieldByKey = new Map(
        spreadsheetImportFields.map((field) => [field.key, field]),
      );

      for (
        let batchStart = 0;
        batchStart < rows.length;
        batchStart += SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE
      ) {
        const batch = rows.slice(
          batchStart,
          batchStart + SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE,
        );
        const { data } = await apolloCoreClient.query<Record<string, unknown>>({
          query: preflightQuery,
          variables: {
            data: batch.map((row) => buildRecordInput(row)),
            rowIds: batch.map((row) => row.__index),
            sourceStates: batch.map((row) => {
              const parsedSourceStates = JSON.parse(
                typeof row.__sourceStates === 'string'
                  ? row.__sourceStates
                  : '{}',
              ) as Record<string, 'EMPTY' | 'VALUE'>;

              const fieldDecisions = JSON.parse(
                typeof row.__fieldDecisions === 'string'
                  ? row.__fieldDecisions
                  : '{}',
              ) as Record<string, string>;

              return Object.entries(parsedSourceStates).flatMap(
                ([fieldKey, state]) => {
                  const field = fieldByKey.get(fieldKey);

                  if (
                    !isDefined(field) ||
                    fieldDecisions[fieldKey] === 'IGNORE_INCOMING_FIELD'
                  ) {
                    return [];
                  }

                  return [
                    {
                      fieldMetadataId: field.fieldMetadataItemId,
                      subFieldPath: isDefined(field.compositeSubFieldKey)
                        ? [field.compositeSubFieldKey]
                        : [],
                      state,
                    },
                  ];
                },
              );
            }),
          },
          fetchPolicy: 'no-cache',
        });
        if (!isDefined(data)) {
          throw new Error('Import preflight returned no data.');
        }
        const parsedResults = z
          .array(preflightResultSchema)
          .parse(
            data[getPreflightResolverName(objectMetadataItem.nameSingular)],
          );

        if (parsedResults.length !== batch.length) {
          throw new Error('Import preflight returned an incomplete result.');
        }

        results.push(...parsedResults);
      }

      return results;
    };

    openSpreadsheetImportDialog({
      ...options,
      onSubmit: async (data) => {
        const getPreflightStatus = (row: ImportedStructuredRow) =>
          (
            row as ImportedStructuredRow & {
              __preflight?: SpreadsheetImportPreflightResult;
            }
          ).__preflight?.status;
        const newRows = data.validStructuredRows.filter(
          (row) => getPreflightStatus(row) === 'NEW',
        );
        const updateRows = data.validStructuredRows.filter(
          (row) => getPreflightStatus(row) === 'EXISTING_WITH_CHANGES',
        );
        const compiledUpdateRows = updateRows.map((row) => ({
          row,
          record: buildRecordInput(row),
        }));
        const preservedRows = compiledUpdateRows.filter(
          ({ record }) => !hasEffectiveSpreadsheetImportUpdate(record),
        );
        const effectiveUpdateRows = compiledUpdateRows.filter(({ record }) =>
          hasEffectiveSpreadsheetImportUpdate(record),
        );
        let confirmedNewRows: ImportedStructuredRow[] = [];
        let confirmedUpdatedRows: ImportedStructuredRow[] = [];
        let errorMessage: string | undefined;

        if (newRows.length > 0) {
          try {
            const records = await batchCreateManyRecords({
              recordsToCreate: newRows.map(buildRecordInput),
              upsert: false,
            });
            confirmedNewRows = newRows.slice(0, records.length);
          } catch (error) {
            if (error instanceof BatchCreateManyRecordsError) {
              confirmedNewRows = newRows.slice(
                0,
                error.successfulRecords.length,
              );
            }
            errorMessage = t`Some record writes failed or could not be confirmed.`;
          }
        }

        if (effectiveUpdateRows.length > 0) {
          try {
            const records = await batchCreateManyRecords({
              recordsToCreate: effectiveUpdateRows.map(({ record }) => record),
              upsert: true,
              startingCount: confirmedNewRows.length,
            });
            confirmedUpdatedRows = effectiveUpdateRows
              .slice(0, records.length)
              .map(({ row }) => row);
          } catch (error) {
            if (error instanceof BatchCreateManyRecordsError) {
              confirmedUpdatedRows = effectiveUpdateRows
                .slice(0, error.successfulRecords.length)
                .map(({ row }) => row);
            }
            errorMessage = t`Some record writes failed or could not be confirmed.`;
          }
        }

        const confirmedRows = [...confirmedNewRows, ...confirmedUpdatedRows];

        if (confirmedRows.length > 0) {
          try {
            await apolloCoreClient.refetchQueries({
              updateCache: (cache) => {
                cache.evict({ fieldName: objectMetadataItem.namePlural });
              },
            });
          } catch {
            errorMessage = t`Records were saved, but the CRM list could not be refreshed.`;
          }
        }

        const created = confirmedNewRows.length;
        const updated = confirmedUpdatedRows.length;
        const skippedExisting = data.allStructuredRows.filter(
          (row) => row.__preflight?.status === 'EXACT_EXISTING_MATCH',
        ).length;
        const preservationMessages = preservedRows.flatMap(({ row }) => {
          const preflight = (
            row as ImportedStructuredRow & {
              __preflight?: SpreadsheetImportPreflightResult;
              __fieldDecisions?: string;
            }
          ).__preflight;

          if (!isDefined(preflight)) {
            return [];
          }

          const decisions = JSON.parse(
            (row as ImportedStructuredRow & { __fieldDecisions?: string })
              .__fieldDecisions ?? '{}',
          ) as Record<string, string>;

          return preflight.fieldDifferences.flatMap((difference) => {
            if (
              difference.sourceState !== 'EMPTY' ||
              decisions[getSpreadsheetImportFieldDifferenceKey(difference)] !==
                'KEEP_EXISTING'
            ) {
              return [];
            }

            const field = spreadsheetImportFields.find(
              ({ fieldMetadataItemId, compositeSubFieldKey }) =>
                fieldMetadataItemId === difference.fieldMetadataId &&
                compositeSubFieldKey === difference.subFieldPath[0],
            );

            return [
              field
                ? t`${field.label} was preserved because its Excel cell was empty.`
                : t`An existing value was preserved because its Excel cell was empty.`,
            ];
          });
        });
        const skippedDuplicateRows = data.allStructuredRows.filter(
          (row) => row.__duplicateResolutionStatus === 'SKIP',
        ).length;
        const skippedDuplicateRowNumbers = data.allStructuredRows.flatMap(
          (row) =>
            row.__duplicateResolutionStatus === 'SKIP' &&
            isDefined(row.__duplicateInFileRowNumber)
              ? [Number(row.__duplicateInFileRowNumber)]
              : [],
        );
        const skippedManually = data.allStructuredRows.filter(
          (row) =>
            row.__preflightAction === 'SKIP_RECORD' &&
            row.__preflight?.status !== 'EXACT_EXISTING_MATCH',
        ).length;
        const failed = Math.max(
          0,
          data.validStructuredRows.length -
            confirmedRows.length -
            preservedRows.length,
        );
        const notImported = Math.max(
          0,
          data.allStructuredRows.length -
            confirmedRows.length -
            skippedExisting -
            preservedRows.length -
            skippedDuplicateRows -
            skippedManually -
            failed,
        );
        const rowNumberById = new Map(
          data.allStructuredRows.map((row, index) => [
            row.__index,
            row.__excelRowNumber ?? index + 2,
          ]),
        );
        const skippedManuallyRowNumbers = data.allStructuredRows.flatMap(
          (row, index) =>
            row.__preflightAction === 'SKIP_RECORD'
              ? [row.__excelRowNumber ?? index + 2]
              : [],
        );
        const ignoredFieldValues = data.allStructuredRows.flatMap(
          (row, index) => {
            if (
              row.__preflightAction === 'SKIP_RECORD' ||
              row.__duplicateResolutionStatus === 'SKIP'
            ) {
              return [];
            }

            const decisions = JSON.parse(
              row.__fieldDecisions ?? '{}',
            ) as Record<string, string>;
            const recordLabelField = spreadsheetImportFields.find(
              (field) => field.isLabelIdentifier,
            );
            const recordLabel = recordLabelField
              ? String(row[recordLabelField.key] ?? '')
              : undefined;

            return Object.entries(row.__errors ?? {}).flatMap(
              ([fieldKey, issue]) => {
                if (
                  decisions[fieldKey] !== 'IGNORE_INCOMING_FIELD' ||
                  issue.level !== 'error'
                ) {
                  return [];
                }

                const field = spreadsheetImportFields.find(
                  ({ key }) => key === fieldKey,
                );
                const incomingValue = row[fieldKey];

                return [
                  {
                    rowNumber: row.__excelRowNumber ?? index + 2,
                    ...(recordLabel ? { recordLabel } : {}),
                    fieldLabel: field?.label ?? fieldKey,
                    incomingValue:
                      incomingValue === undefined || incomingValue === null
                        ? ''
                        : typeof incomingValue === 'string'
                          ? incomingValue
                          : JSON.stringify(incomingValue),
                    reason: issue.message,
                  },
                ];
              },
            );
          },
        );
        const rowIssues = data.allStructuredRows.flatMap((row, index) => {
          if (
            row.__preflightAction === 'SKIP_RECORD' ||
            row.__duplicateResolutionStatus === 'SKIP'
          ) {
            return [];
          }

          const decisions = JSON.parse(row.__fieldDecisions ?? '{}') as Record<
            string,
            string
          >;

          return Object.entries(row.__errors ?? {})
            .filter(
              ([fieldKey, issue]) =>
                issue.level === 'error' &&
                decisions[fieldKey] !== 'IGNORE_INCOMING_FIELD' &&
                decisions[fieldKey] !== 'ACCEPT_INCOMING_WARNING',
            )
            .map(([, issue]) => ({
              rowNumber: row.__excelRowNumber ?? index + 2,
              message: issue.message,
            }));
        });
        data.validStructuredRows
          .filter(
            (row) =>
              !confirmedRows.includes(row) &&
              !preservedRows.some(
                ({ row: preservedRow }) => preservedRow === row,
              ),
          )
          .forEach((row) => {
            const rowNumber = rowNumberById.get(
              (row as ImportedStructuredRow & { __index?: string }).__index ??
                '',
            );

            if (isDefined(rowNumber)) {
              rowIssues.push({
                rowNumber,
                message: t`The write result was not confirmed for this row.`,
              });
            }
          });

        const status =
          failed > 0 || notImported > 0
            ? confirmedRows.length > 0
              ? 'partial'
              : 'failed'
            : 'completed';

        return {
          status,
          created,
          updated,
          skippedExisting,
          skippedPreserved: preservedRows.length,
          skippedDuplicateRows,
          skippedDuplicateRowNumbers,
          skippedManually,
          skippedManuallyRowNumbers,
          notImported,
          failed,
          totalRows: data.allStructuredRows.length,
          errorMessage,
          preservationMessages,
          ignoredFieldValues,
          rowIssues,
        };
      },
      spreadsheetImportFields,
      spreadsheetImportHeaderDefinitions,
      availableFieldMetadataItems: availableFieldMetadataItemsToImport,
      preflightStepHook,
      onAbortSubmit: () => {
        abortController.abort();
      },
      tableHook: spreadsheetImportGetUnicityTableHook(
        objectMetadataItem,
        spreadsheetImportFields,
      ),
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
