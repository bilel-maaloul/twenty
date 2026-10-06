import { msg } from '@lingui/core/macro';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type ConflictingFieldGroup } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/types/conflicting-field-group.type';
import { type PartialObjectRecordWithId } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/types/partial-object-record-with-id.type';
import { getValueFromPath } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/get-value-from-path.util';
import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';

export type MatchingRecordDetails = {
  matchingRecordId?: string;
  matchingRecordIds: string[];
  matchingFieldGroupIndexes: number[];
};

export const getMatchingRecordDetails = (
  record: Partial<ObjectRecord>,
  conflictingFieldGroups: ConflictingFieldGroup[],
  existingRecords: PartialObjectRecordWithId[],
): MatchingRecordDetails => {
  const matchingRecordIdsByFieldGroup = conflictingFieldGroups.map(
    (fieldGroup) => {
      const requestFieldValues = fieldGroup.conflictingProperties.map(
        (conflictingProperty) => ({
          conflictingProperty,
          value: getValueFromPath(record, conflictingProperty.fullPath),
        }),
      );

      if (requestFieldValues.some(({ value }) => !isDefined(value))) {
        return undefined;
      }

      const matchingRecord = existingRecords.find((existingRecord) =>
        requestFieldValues.every(({ conflictingProperty, value }) => {
          const existingFieldValue = getValueFromPath(
            existingRecord,
            conflictingProperty.fullPath,
          );

          return isDefined(existingFieldValue) && existingFieldValue === value;
        }),
      );

      if (isDefined(matchingRecord)) {
        return matchingRecord.id;
      }

      return undefined;
    },
  );

  const matchingFieldGroupIndexes = matchingRecordIdsByFieldGroup.reduce<
    number[]
  >((acc, matchingRecordId, index) => {
    if (isDefined(matchingRecordId)) {
      acc.push(index);
    }

    return acc;
  }, []);

  const matchingRecordIds = [
    ...new Set(matchingRecordIdsByFieldGroup.filter(isDefined)),
  ];

  return {
    matchingRecordId:
      matchingRecordIds.length === 1 ? matchingRecordIds[0] : undefined,
    matchingRecordIds,
    matchingFieldGroupIndexes,
  };
};

export const getMatchingRecordId = (
  record: Partial<ObjectRecord>,
  conflictingFieldGroups: ConflictingFieldGroup[],
  existingRecords: PartialObjectRecordWithId[],
): string | undefined => {
  const matchingRecordDetails = getMatchingRecordDetails(
    record,
    conflictingFieldGroups,
    existingRecords,
  );

  if (matchingRecordDetails.matchingRecordIds.length > 1) {
    const conflictingFieldsValues = conflictingFieldGroups
      .map((group) => {
        const values = group.conflictingProperties
          .map((conflictingProperty) => {
            const value = getValueFromPath(
              record,
              conflictingProperty.fullPath,
            );

            return isDefined(value)
              ? `${conflictingProperty.fullPath}: ${value}`
              : undefined;
          })
          .filter(isDefined);

        if (values.length === 0) {
          return undefined;
        }

        return `${group.baseFields.join(', ')} (${values.join(', ')})`;
      })
      .filter(isDefined)
      .join('; ');

    throw new CommonQueryRunnerException(
      `Multiple records found with the same unique field values for ${conflictingFieldsValues}. Cannot determine which record to update.`,
      CommonQueryRunnerExceptionCode.UPSERT_MULTIPLE_MATCHING_RECORDS_CONFLICT,
      {
        userFriendlyMessage: msg`Multiple records found with the same unique field values for ${conflictingFieldsValues}. Cannot determine which record to update.`,
      },
    );
  }

  return matchingRecordDetails.matchingRecordId;
};
