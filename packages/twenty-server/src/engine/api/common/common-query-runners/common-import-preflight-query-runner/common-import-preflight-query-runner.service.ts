import { Injectable } from '@nestjs/common';

import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { CommonBaseQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import { findExistingRecords } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/find-existing-records.util';
import { getConflictingFieldGroups } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/get-conflicting-fields.util';
import { getMatchingRecordDetails } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/get-matching-record-id.util';
import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { STANDARD_ERROR_MESSAGE } from 'src/engine/api/common/common-query-runners/errors/standard-error-message.constant';
import { type CommonBaseQueryRunnerContext } from 'src/engine/api/common/types/common-base-query-runner-context.type';
import { type CommonExtendedQueryRunnerContext } from 'src/engine/api/common/types/common-extended-query-runner-context.type';
import { type CommonImportPreflightResult } from 'src/engine/api/common/types/common-import-preflight-result.type';
import {
  type CommonExtendedInput,
  type CommonInput,
  CommonQueryNames,
  type ImportPreflightQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { compareImportRecordToExisting } from 'src/engine/api/common/common-query-runners/common-import-preflight-query-runner/compare-import-record.util';

@Injectable()
export class CommonImportPreflightQueryRunnerService extends CommonBaseQueryRunnerService<
  ImportPreflightQueryArgs,
  CommonImportPreflightResult[]
> {
  protected readonly operationName = CommonQueryNames.IMPORT_PREFLIGHT;
  protected readonly isReadOnly = true;

  async run(
    args: CommonExtendedInput<ImportPreflightQueryArgs>,
    queryRunnerContext: CommonExtendedQueryRunnerContext,
  ): Promise<CommonImportPreflightResult[]> {
    const {
      flatObjectMetadata,
      flatFieldMetadataMaps,
      flatIndexMaps,
      repository,
    } = queryRunnerContext;

    if (!isDefined(flatIndexMaps)) {
      throw new CommonQueryRunnerException(
        'Missing flatIndexMaps in queryRunnerContext',
        CommonQueryRunnerExceptionCode.MISSING_FLAT_INDEX_MAPS,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    const conflictingFieldGroups = getConflictingFieldGroups(
      flatObjectMetadata,
      flatFieldMetadataMaps,
      flatIndexMaps,
    );
    const existingRecords = await findExistingRecords({
      repository,
      flatObjectMetadata,
      flatFieldMetadataMaps,
      records: args.data,
      conflictingFieldGroups,
    });
    const existingRecordById = new Map(
      existingRecords.map((record) => [record.id, record]),
    );

    return args.data.map((record, recordIndex) => {
      const matchingRecordDetails = getMatchingRecordDetails(
        record,
        conflictingFieldGroups,
        existingRecords,
      );
      const matchedGroups = matchingRecordDetails.matchingFieldGroupIndexes.map(
        (groupIndex) => conflictingFieldGroups[groupIndex],
      );

      if (matchingRecordDetails.matchingRecordIds.length > 1) {
        return {
          rowId: args.rowIds[recordIndex],
          status: 'CONFLICT',
          matchedRecordIds: matchingRecordDetails.matchingRecordIds,
          matchedConstraintIds: matchedGroups.map(
            (group) => group.indexMetadataId,
          ),
          matchedConstraintNames: matchedGroups.map(
            (group) => group.indexMetadataName,
          ),
          changedFieldNames: [],
          uncomparableFieldNames: [],
          fieldDifferences: [],
        };
      }

      if (!isDefined(matchingRecordDetails.matchingRecordId)) {
        return {
          rowId: args.rowIds[recordIndex],
          status: 'NEW',
          matchedRecordIds: [],
          matchedConstraintIds: [],
          matchedConstraintNames: [],
          changedFieldNames: [],
          uncomparableFieldNames: [],
          fieldDifferences: [],
        };
      }

      const existingRecord = existingRecordById.get(
        matchingRecordDetails.matchingRecordId,
      );

      if (!isDefined(existingRecord)) {
        return {
          rowId: args.rowIds[recordIndex],
          status: 'CONFLICT',
          matchedRecordIds: [matchingRecordDetails.matchingRecordId],
          matchedConstraintIds: matchedGroups.map(
            (group) => group.indexMetadataId,
          ),
          matchedConstraintNames: matchedGroups.map(
            (group) => group.indexMetadataName,
          ),
          changedFieldNames: [],
          uncomparableFieldNames: [],
          fieldDifferences: [],
        };
      }

      const comparison = compareImportRecordToExisting({
        incomingRecord: record,
        existingRecord,
        flatObjectMetadata,
        flatFieldMetadataMaps,
        sourceStates: args.sourceStates?.[recordIndex],
      });
      const hasChanges =
        comparison.changedFieldNames.length > 0 ||
        comparison.uncomparableFieldNames.length > 0;

      return {
        rowId: args.rowIds[recordIndex],
        status: hasChanges ? 'EXISTING_WITH_CHANGES' : 'EXACT_EXISTING_MATCH',
        existingRecordId: matchingRecordDetails.matchingRecordId,
        matchedRecordIds: matchingRecordDetails.matchingRecordIds,
        matchedConstraintIds: matchedGroups.map(
          (group) => group.indexMetadataId,
        ),
        matchedConstraintNames: matchedGroups.map(
          (group) => group.indexMetadataName,
        ),
        changedFieldNames: comparison.changedFieldNames,
        uncomparableFieldNames: comparison.uncomparableFieldNames,
        fieldDifferences: comparison.fieldDifferences,
      };
    });
  }

  async computeArgs(
    args: CommonInput<ImportPreflightQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<CommonInput<ImportPreflightQueryArgs>> {
    const {
      authContext,
      flatObjectMetadata,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    } = queryRunnerContext;

    return {
      ...args,
      data: await this.dataArgProcessor.process({
        partialRecordInputs: args.data,
        authContext,
        flatObjectMetadata,
        flatFieldMetadataMaps,
        flatObjectMetadataMaps,
        shouldBackfillPositionIfUndefined: false,
      }),
    };
  }

  async validate(
    args: CommonInput<ImportPreflightQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<void> {
    if (args.data.length > QUERY_MAX_RECORDS) {
      throw new CommonQueryRunnerException(
        `Maximum number of records to preflight is ${QUERY_MAX_RECORDS}.`,
        CommonQueryRunnerExceptionCode.TOO_MANY_RECORDS_TO_UPDATE,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    if (args.data.length !== args.rowIds.length) {
      throw new CommonQueryRunnerException(
        'The number of row identifiers must match the number of records.',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    if (new Set(args.rowIds).size !== args.rowIds.length) {
      throw new CommonQueryRunnerException(
        'Row identifiers must be unique within a preflight request.',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    if (
      isDefined(args.sourceStates) &&
      args.sourceStates.length !== args.data.length
    ) {
      throw new CommonQueryRunnerException(
        'The number of source-state rows must match the number of records.',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    const invalidSourceState = args.sourceStates?.some(
      (rowSourceStates) =>
        !Array.isArray(rowSourceStates) ||
        rowSourceStates.some((sourceState) => {
          if (typeof sourceState !== 'object' || sourceState === null) {
            return true;
          }

          return (
            typeof sourceState.fieldMetadataId !== 'string' ||
            !queryRunnerContext.flatObjectMetadata?.fieldIds.includes(
              sourceState.fieldMetadataId,
            ) ||
            !['EMPTY', 'VALUE'].includes(sourceState.state) ||
            !Array.isArray(sourceState.subFieldPath) ||
            sourceState.subFieldPath.length > 1 ||
            sourceState.subFieldPath.some(
              (pathPart) => typeof pathPart !== 'string',
            )
          );
        }),
    );

    if (invalidSourceState) {
      throw new CommonQueryRunnerException(
        'Import source-state metadata is invalid.',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }
  }

  async processQueryResult(
    queryResult: CommonImportPreflightResult[],
    _flatObjectMetadata: FlatObjectMetadata,
    _flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    _flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>,
    _authContext: CommonBaseQueryRunnerContext['authContext'],
  ): Promise<CommonImportPreflightResult[]> {
    return queryResult;
  }
}
