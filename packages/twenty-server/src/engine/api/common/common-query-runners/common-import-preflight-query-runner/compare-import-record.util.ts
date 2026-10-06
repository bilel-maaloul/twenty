import { FieldMetadataType, type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

export type ImportRecordComparison = {
  changedFieldNames: string[];
  uncomparableFieldNames: string[];
  fieldDifferences: Array<{
    fieldMetadataId: string;
    fieldName: string;
    subFieldPath: string[];
    existingValue: unknown;
    incomingValue: unknown;
    sourceState: 'EMPTY' | 'VALUE';
    clearAllowed: boolean;
    comparable: boolean;
  }>;
};

type ImportSourceState = {
  fieldMetadataId: string;
  subFieldPath: string[];
  state: 'EMPTY' | 'VALUE';
};

const getPathValue = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      isRecord(current) && Object.prototype.hasOwnProperty.call(current, key)
        ? current[key]
        : undefined,
    value,
  );

const isEmptyForReview = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const canClearField = (fieldMetadata: OrmFlatFieldMetadata): boolean =>
  fieldMetadata.isNullable === true &&
  ![
    FieldMetadataType.RELATION,
    FieldMetadataType.MORPH_RELATION,
    FieldMetadataType.FILES,
    FieldMetadataType.POSITION,
    FieldMetadataType.ACTOR,
    FieldMetadataType.TS_VECTOR,
    FieldMetadataType.RICH_TEXT,
  ].includes(fieldMetadata.type);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeComparableValue = (
  value: unknown,
  fieldType: FieldMetadataType,
): unknown => {
  if (
    typeof value === 'string' &&
    [
      FieldMetadataType.PHONES,
      FieldMetadataType.EMAILS,
      FieldMetadataType.LINKS,
    ].includes(fieldType)
  ) {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    (fieldType === FieldMetadataType.DATE ||
      fieldType === FieldMetadataType.DATE_TIME) &&
    typeof value === 'string'
  ) {
    const parsedDate = new Date(value);

    return Number.isNaN(parsedDate.getTime())
      ? value
      : parsedDate.toISOString();
  }

  if (
    fieldType === FieldMetadataType.NUMBER ||
    fieldType === FieldMetadataType.NUMERIC
  ) {
    if (value === null || typeof value === 'number') {
      return value;
    }

    if (typeof value !== 'string' || value.trim() === '') {
      return value;
    }

    const numericValue = Number(value);

    return Number.isNaN(numericValue) ? value : numericValue;
  }

  if (Array.isArray(value)) {
    const normalizedValues = value.map((item) =>
      normalizeComparableValue(item, fieldType),
    );

    if (fieldType === FieldMetadataType.MULTI_SELECT) {
      return [...normalizedValues].sort((firstValue, secondValue) =>
        JSON.stringify(firstValue).localeCompare(JSON.stringify(secondValue)),
      );
    }

    return normalizedValues;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([key, nestedValue]) => [
          key,
          normalizeComparableValue(nestedValue, fieldType),
        ]),
    );
  }

  return value;
};

const compareProvidedValue = (
  incomingValue: unknown,
  existingValue: unknown,
  fieldType: FieldMetadataType,
): 'equal' | 'different' | 'uncomparable' => {
  if (isRecord(incomingValue)) {
    if (!isRecord(existingValue)) {
      return 'different';
    }

    for (const [key, nestedIncomingValue] of Object.entries(incomingValue)) {
      if (nestedIncomingValue === undefined) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(existingValue, key)) {
        return 'uncomparable';
      }

      const comparison = compareProvidedValue(
        nestedIncomingValue,
        existingValue[key],
        fieldType,
      );

      if (comparison !== 'equal') {
        return comparison;
      }
    }

    return 'equal';
  }

  return JSON.stringify(normalizeComparableValue(incomingValue, fieldType)) ===
    JSON.stringify(normalizeComparableValue(existingValue, fieldType))
    ? 'equal'
    : 'different';
};

export const compareImportRecordToExisting = ({
  incomingRecord,
  existingRecord,
  flatObjectMetadata,
  flatFieldMetadataMaps,
  sourceStates = [],
}: {
  incomingRecord: Partial<ObjectRecord>;
  existingRecord: Partial<ObjectRecord>;
  flatObjectMetadata: FlatObjectMetadata;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  sourceStates?: ImportSourceState[];
}): ImportRecordComparison => {
  const changedFieldNames: string[] = [];
  const uncomparableFieldNames: string[] = [];
  const fieldDifferences: ImportRecordComparison['fieldDifferences'] = [];

  for (const sourceState of sourceStates) {
    const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: sourceState.fieldMetadataId,
      flatEntityMaps: flatFieldMetadataMaps,
    });

    if (
      !isDefined(fieldMetadata) ||
      !flatObjectMetadata.fieldIds.includes(fieldMetadata.id) ||
      !Object.prototype.hasOwnProperty.call(existingRecord, fieldMetadata.name)
    ) {
      continue;
    }

    const existingValue = getPathValue(
      existingRecord[fieldMetadata.name],
      sourceState.subFieldPath,
    );
    const incomingValue = getPathValue(
      incomingRecord[fieldMetadata.name],
      sourceState.subFieldPath,
    );
    const isMeaningfulEmptyDifference =
      sourceState.state === 'EMPTY' && !isEmptyForReview(existingValue);
    const isValueDifference =
      sourceState.state === 'VALUE' &&
      isDefined(incomingValue) &&
      compareProvidedValue(incomingValue, existingValue, fieldMetadata.type) !==
        'equal';

    if (!isMeaningfulEmptyDifference && !isValueDifference) {
      continue;
    }

    fieldDifferences.push({
      fieldMetadataId: fieldMetadata.id,
      fieldName: fieldMetadata.name,
      subFieldPath: sourceState.subFieldPath,
      existingValue,
      incomingValue: sourceState.state === 'EMPTY' ? null : incomingValue,
      sourceState: sourceState.state,
      clearAllowed: canClearField(fieldMetadata),
      comparable: true,
    });

    if (!changedFieldNames.includes(fieldMetadata.name)) {
      changedFieldNames.push(fieldMetadata.name);
    }
  }

  for (const [fieldName, incomingValue] of Object.entries(incomingRecord)) {
    if (incomingValue === undefined) {
      continue;
    }

    const fieldMetadataId = flatObjectMetadata.fieldIds.find((fieldId) => {
      const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: fieldId,
        flatEntityMaps: flatFieldMetadataMaps,
      });

      return fieldMetadata?.name === fieldName;
    });
    const fieldMetadata = isDefined(fieldMetadataId)
      ? findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: fieldMetadataId,
          flatEntityMaps: flatFieldMetadataMaps,
        })
      : undefined;

    if (!isDefined(fieldMetadata)) {
      uncomparableFieldNames.push(fieldName);
      continue;
    }

    if (
      fieldMetadata.type === FieldMetadataType.RELATION ||
      fieldMetadata.type === FieldMetadataType.MORPH_RELATION
    ) {
      uncomparableFieldNames.push(fieldName);
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(existingRecord, fieldName)) {
      uncomparableFieldNames.push(fieldName);
      continue;
    }

    const comparison = compareProvidedValue(
      incomingValue,
      existingRecord[fieldName],
      fieldMetadata.type,
    );

    if (comparison === 'different') {
      if (!changedFieldNames.includes(fieldName)) {
        changedFieldNames.push(fieldName);
      }
    }

    if (
      comparison === 'uncomparable' &&
      !uncomparableFieldNames.includes(fieldName)
    ) {
      uncomparableFieldNames.push(fieldName);
    }
  }

  return { changedFieldNames, uncomparableFieldNames, fieldDifferences };
};
