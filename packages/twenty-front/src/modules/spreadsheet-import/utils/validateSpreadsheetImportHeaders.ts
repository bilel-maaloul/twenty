import { t } from '@lingui/core/macro';

import {
  type SpreadsheetImportHeaderDefinition,
  type SpreadsheetImportHeaderDefinitionKind,
} from '@/spreadsheet-import/types/SpreadsheetImportHeaderDefinition';
import { type ImportedRow } from '@/spreadsheet-import/types/SpreadsheetImportImportedRow';

export type SpreadsheetImportHeaderValidationErrorType =
  'ambiguous' | 'duplicate' | 'unknown' | 'unnamed';

export type SpreadsheetImportHeaderValidationError = {
  columnIndex: number;
  header: string;
  type: SpreadsheetImportHeaderValidationErrorType;
};

export type SpreadsheetImportHeaderMatch = {
  columnIndex: number;
  fieldKey?: string;
  header: string;
  kind?: SpreadsheetImportHeaderDefinitionKind;
};

export type StrictSpreadsheetImportHeaderValidationResult = {
  errors: SpreadsheetImportHeaderValidationError[];
  matches: SpreadsheetImportHeaderMatch[];
  missingHeaders: string[];
  meaningfulColumnCount: number;
  recognizedColumnCount: number;
};

export const normalizeSpreadsheetImportHeader = (header: unknown): string =>
  String(header ?? '').trim();

const hasMeaningfulValue = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== '';

export const getColumnErrorMessage = (
  type: SpreadsheetImportHeaderValidationErrorType,
): string => {
  switch (type) {
    case 'ambiguous':
      return t`matches more than one CRM field`;
    case 'duplicate':
      return t`is duplicated in the spreadsheet`;
    case 'unknown':
      return t`does not match a field in this CRM object`;
    case 'unnamed':
      return t`contains data but has no header`;
  }
};

export const validateSpreadsheetImportHeaders = ({
  data,
  fieldKeys,
  headerValues,
  headerDefinitions,
}: {
  data: ImportedRow[];
  fieldKeys: ReadonlySet<string>;
  headerValues: ImportedRow;
  headerDefinitions: SpreadsheetImportHeaderDefinition[];
}): StrictSpreadsheetImportHeaderValidationResult => {
  const definitionsByHeader = new Map<
    string,
    SpreadsheetImportHeaderDefinition[]
  >();

  for (const definition of headerDefinitions) {
    const normalizedHeader = normalizeSpreadsheetImportHeader(
      definition.header,
    );

    if (normalizedHeader === '') {
      continue;
    }

    const definitions = definitionsByHeader.get(normalizedHeader) ?? [];
    definitions.push(definition);
    definitionsByHeader.set(normalizedHeader, definitions);
  }

  const importedHeaderCounts = new Map<string, number>();
  for (const header of headerValues) {
    const normalizedHeader = normalizeSpreadsheetImportHeader(header);

    if (normalizedHeader !== '') {
      importedHeaderCounts.set(
        normalizedHeader,
        (importedHeaderCounts.get(normalizedHeader) ?? 0) + 1,
      );
    }
  }

  const columnCount = Math.max(
    headerValues.length,
    ...data.map((row) => row.length),
  );
  const errors: SpreadsheetImportHeaderValidationError[] = [];
  const matches: SpreadsheetImportHeaderMatch[] = [];
  const usedFieldKeys = new Set<string>();
  const actualValidHeaders = new Set<string>();
  let meaningfulColumnCount = 0;
  let recognizedColumnCount = 0;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const importedHeader = headerValues[columnIndex] ?? '';
    const normalizedHeader = normalizeSpreadsheetImportHeader(importedHeader);
    const hasData = data.some((row) => hasMeaningfulValue(row[columnIndex]));

    if (normalizedHeader === '' && !hasData) {
      matches.push({ columnIndex, header: importedHeader });
      continue;
    }

    meaningfulColumnCount += 1;

    if (normalizedHeader === '') {
      const error = {
        columnIndex,
        header: importedHeader,
        type: 'unnamed' as const,
      };
      errors.push(error);
      matches.push({ columnIndex, header: importedHeader });
      continue;
    }

    if ((importedHeaderCounts.get(normalizedHeader) ?? 0) > 1) {
      const error = {
        columnIndex,
        header: importedHeader,
        type: 'duplicate' as const,
      };
      errors.push(error);
      matches.push({ columnIndex, header: importedHeader });
      continue;
    }

    const matchingDefinitions = definitionsByHeader.get(normalizedHeader);

    if (!matchingDefinitions || matchingDefinitions.length !== 1) {
      const error = {
        columnIndex,
        header: importedHeader,
        type: matchingDefinitions?.length
          ? ('ambiguous' as const)
          : ('unknown' as const),
      };
      errors.push(error);
      matches.push({ columnIndex, header: importedHeader });
      continue;
    }

    const [matchingDefinition] = matchingDefinitions;
    const { fieldKey } = matchingDefinition;

    if (matchingDefinition.kind === 'readOnly') {
      recognizedColumnCount += 1;
      actualValidHeaders.add(normalizedHeader);
      matches.push({
        columnIndex,
        header: importedHeader,
        kind: matchingDefinition.kind,
      });
      continue;
    }

    if (
      matchingDefinition.kind !== 'importable' ||
      fieldKey === undefined ||
      !fieldKeys.has(fieldKey) ||
      usedFieldKeys.has(fieldKey)
    ) {
      const error = {
        columnIndex,
        header: importedHeader,
        type: 'ambiguous' as const,
      };
      errors.push(error);
      matches.push({ columnIndex, header: importedHeader });
      continue;
    }

    usedFieldKeys.add(fieldKey);
    recognizedColumnCount += 1;
    actualValidHeaders.add(normalizedHeader);
    matches.push({
      columnIndex,
      fieldKey,
      header: importedHeader,
      kind: matchingDefinition.kind,
    });
  }

  const expectedHeaders = Array.from(
    new Set(
      headerDefinitions
        .map(({ header }) => normalizeSpreadsheetImportHeader(header))
        .filter((header) => header !== ''),
    ),
  );
  const missingHeaders = expectedHeaders.filter(
    (header) => !actualValidHeaders.has(header),
  );

  return {
    errors,
    matches,
    missingHeaders,
    meaningfulColumnCount,
    recognizedColumnCount,
  };
};

export const getSpreadsheetImportHeaderValidationErrorMessage = (
  result: StrictSpreadsheetImportHeaderValidationResult,
): string => {
  if (result.missingHeaders.length > 0) {
    const missingHeadersMessage = t`Missing expected headers: ${result.missingHeaders.join(', ')}`;
    const invalidHeaders = result.errors
      .map(({ header, type }) => {
        const normalizedHeader = header.trim();

        return normalizedHeader === ''
          ? getColumnErrorMessage(type)
          : `${normalizedHeader}: ${getColumnErrorMessage(type)}`;
      })
      .join('; ');

    return invalidHeaders === ''
      ? t`This spreadsheet cannot be imported. ${missingHeadersMessage}`
      : t`This spreadsheet cannot be imported. ${missingHeadersMessage}. Other header problems: ${invalidHeaders}`;
  }

  if (result.recognizedColumnCount > 0) {
    const invalidHeaders = result.errors
      .map(({ header, type }) => {
        const normalizedHeader = header.trim();

        return normalizedHeader === ''
          ? getColumnErrorMessage(type)
          : `${normalizedHeader}: ${getColumnErrorMessage(type)}`;
      })
      .join('; ');

    return invalidHeaders === ''
      ? t`Some spreadsheet headers do not match the current CRM object fields.`
      : t`This file does not match the CRM import format. Header problems: ${invalidHeaders}`;
  }

  const unmatchedHeaders = result.errors
    .map(({ header }) => header.trim())
    .filter((header) => header !== '');

  if (unmatchedHeaders.length > 0) {
    return t`No spreadsheet headers match the current CRM object fields. Unmatched headers: ${unmatchedHeaders.join(', ')}`;
  }

  return t`The spreadsheet does not contain a recognizable header row.`;
};
