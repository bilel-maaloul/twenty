import { useCallback } from 'react';

import { useSpreadsheetImportInternal } from '@/spreadsheet-import/hooks/useSpreadsheetImportInternal';
import {
  initialComputedColumnsSelector,
  matchColumnsState,
} from '@/spreadsheet-import/steps/components/MatchColumnsStep/components/states/initialComputedColumnsState';
import { suggestedFieldsByColumnHeaderState } from '@/spreadsheet-import/steps/components/MatchColumnsStep/components/states/suggestedFieldsByColumnHeaderState';
import { type ImportedRow } from '@/spreadsheet-import/types';
import { getStrictMatchedColumns } from '@/spreadsheet-import/utils/getStrictMatchedColumns';
import { getMatchedColumnsWithFuse } from '@/spreadsheet-import/utils/getMatchedColumnsWithFuse';
import { useStore } from 'jotai';

export const useComputeColumnSuggestionsAndAutoMatch = () => {
  const store = useStore();
  const {
    spreadsheetImportFields: fields,
    autoMapHeaders,
    spreadsheetImportHeaderDefinitions,
  } = useSpreadsheetImportInternal();

  const computeColumnSuggestionsAndAutoMatch = useCallback(
    async ({
      headerValues,
      data,
    }: {
      headerValues: ImportedRow;
      data: ImportedRow[];
    }) => {
      if (spreadsheetImportHeaderDefinitions) {
        const result = getStrictMatchedColumns({
          data,
          fields,
          headerDefinitions: spreadsheetImportHeaderDefinitions,
          headerValues,
        });

        store.set(matchColumnsState.atom, result.columns);
        store.set(suggestedFieldsByColumnHeaderState.atom, {});

        return result;
      }

      if (autoMapHeaders) {
        const columns = store.get(
          initialComputedColumnsSelector.selectorFamily(headerValues),
        );

        const { matchedColumns, suggestedFieldsByColumnHeader } =
          getMatchedColumnsWithFuse({ columns, fields, data });

        store.set(matchColumnsState.atom, matchedColumns);
        store.set(
          suggestedFieldsByColumnHeaderState.atom,
          suggestedFieldsByColumnHeader,
        );
      }
    },
    [autoMapHeaders, fields, spreadsheetImportHeaderDefinitions, store],
  );

  return computeColumnSuggestionsAndAutoMatch;
};
