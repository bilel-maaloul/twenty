import {
  type SpreadsheetImportFieldDecision,
  type SpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/types';
import { getSpreadsheetImportFieldDifferenceKey } from '@/spreadsheet-import/utils/spreadsheetImportPreflight';

export const hasEffectiveSpreadsheetImportUpdate = (
  recordInput: Record<string, unknown>,
) => Object.keys(recordInput).some((fieldName) => fieldName !== 'id');

export const compileSpreadsheetImportFieldDecisions = ({
  recordInput,
  preflight,
  action,
  decisions,
  fields = [],
}: {
  recordInput: Record<string, unknown>;
  preflight: SpreadsheetImportPreflightResult | undefined;
  action: string | undefined;
  decisions: Record<string, SpreadsheetImportFieldDecision>;
  fields?: Array<{
    key: string;
    fieldMetadataName?: string;
    compositeSubFieldKey?: string;
    canIgnoreIncomingValue?: boolean;
  }>;
}) => {
  const incomingRecordInput = { ...recordInput };
  let outputRecordInput = recordInput;

  if (
    preflight?.status === 'EXISTING_WITH_CHANGES' &&
    action === 'UPDATE_EXISTING'
  ) {
    if (preflight.existingRecordId === undefined) {
      throw new Error('Cannot build an update without a matched record ID.');
    }

    outputRecordInput = { id: preflight.existingRecordId };

    for (const difference of preflight.fieldDifferences) {
      const decision =
        decisions[getSpreadsheetImportFieldDifferenceKey(difference)];
      if (decision === 'USE_INCOMING') {
        const incomingValue = incomingRecordInput[difference.fieldName];

        if (difference.subFieldPath.length === 0) {
          if (incomingValue !== undefined)
            outputRecordInput[difference.fieldName] = incomingValue;
          continue;
        }

        if (
          typeof incomingValue === 'object' &&
          incomingValue !== null &&
          !Array.isArray(incomingValue) &&
          Object.prototype.hasOwnProperty.call(
            incomingValue,
            difference.subFieldPath[0],
          )
        ) {
          const currentValue = outputRecordInput[difference.fieldName];
          outputRecordInput[difference.fieldName] = {
            ...(typeof currentValue === 'object' &&
            currentValue !== null &&
            !Array.isArray(currentValue)
              ? (currentValue as Record<string, unknown>)
              : {}),
            [difference.subFieldPath[0]]: (
              incomingValue as Record<string, unknown>
            )[difference.subFieldPath[0]],
          };
        }
      } else if (decision === 'CLEAR' && difference.clearAllowed) {
        if (difference.subFieldPath.length === 0) {
          outputRecordInput[difference.fieldName] = null;
          continue;
        }

        const compositeValue = outputRecordInput[difference.fieldName];
        const updatedCompositeValue =
          typeof compositeValue === 'object' &&
          compositeValue !== null &&
          !Array.isArray(compositeValue)
            ? { ...(compositeValue as Record<string, unknown>) }
            : {};
        updatedCompositeValue[difference.subFieldPath[0]] = null;
        outputRecordInput[difference.fieldName] = updatedCompositeValue;
      }
    }
  }

  for (const field of fields) {
    if (
      decisions[field.key] !== 'IGNORE_INCOMING_FIELD' ||
      field.canIgnoreIncomingValue !== true
    ) {
      continue;
    }
    const fieldName = field.fieldMetadataName;
    if (!fieldName) continue;

    if (field.compositeSubFieldKey) {
      const composite = outputRecordInput[fieldName];
      if (
        typeof composite !== 'object' ||
        composite === null ||
        Array.isArray(composite)
      )
        continue;
      const nextComposite = { ...(composite as Record<string, unknown>) };
      delete nextComposite[field.compositeSubFieldKey];
      if (Object.keys(nextComposite).length === 0)
        delete outputRecordInput[fieldName];
      else outputRecordInput[fieldName] = nextComposite;
    } else {
      delete outputRecordInput[fieldName];
    }
  }

  return outputRecordInput;
};
