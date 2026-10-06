import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { ImportResultStep } from '@/spreadsheet-import/steps/components/ImportResultStep';
import { type SpreadsheetImportSubmissionResult } from '@/spreadsheet-import/types';

jest.mock('@lingui/react', () => ({
  ...jest.requireActual('@lingui/react'),
  Trans: ({
    children,
    message,
    values,
  }: {
    children?: ReactNode;
    message?: string;
    values?: Record<string, string | number>;
  }) =>
    message?.replace(/\{(\w+)\}/g, (_placeholder, key: string) =>
      String(values?.[key] ?? ''),
    ) ?? children,
  useLingui: () => ({
    i18n: {
      _: (descriptor: { message: string }, values?: Record<string, unknown>) =>
        descriptor.message.replace(/\{(\w+)\}/g, (_placeholder, key: string) =>
          String(values?.[key] ?? ''),
        ),
    },
  }),
}));
jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: () => ({ onClose: jest.fn() }),
}));
jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: (value: number) => String(value) }),
}));
jest.mock('@/spreadsheet-import/components/StepNavigationButton', () => ({
  StepNavigationButton: () => null,
}));

describe('ImportResultStep duplicate decisions', () => {
  it('identifies duplicate-group skips and the affected uploaded row', () => {
    const result: SpreadsheetImportSubmissionResult = {
      status: 'completed',
      created: 1,
      updated: 0,
      skippedExisting: 0,
      skippedPreserved: 0,
      skippedDuplicateRows: 1,
      skippedDuplicateRowNumbers: [3],
      skippedManually: 0,
      notImported: 0,
      failed: 0,
      totalRows: 2,
    };

    render(<ImportResultStep result={result} />);

    expect(
      screen.getByText('Skipped by duplicate-group decision'),
    ).toBeInTheDocument();
    expect(screen.getByText('Uploaded row 3 was skipped.')).toBeInTheDocument();
  });

  it('shows an informational receipt for all exact-existing records', () => {
    const result: SpreadsheetImportSubmissionResult = {
      status: 'completed',
      outcome: 'NOTHING_TO_IMPORT',
      created: 0,
      updated: 0,
      skippedExisting: 2,
      skippedPreserved: 0,
      skippedDuplicateRows: 0,
      skippedManually: 0,
      notImported: 0,
      failed: 0,
      totalRows: 2,
    };

    render(<ImportResultStep result={result} />);

    expect(screen.getByText('Nothing new to import')).toBeInTheDocument();
    expect(
      screen.getByText(/records already exist in the CRM with the same data/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('uses safe product language for a failed import', () => {
    const result: SpreadsheetImportSubmissionResult = {
      status: 'failed',
      created: 0,
      updated: 0,
      skippedExisting: 0,
      skippedPreserved: 0,
      skippedDuplicateRows: 0,
      skippedManually: 0,
      notImported: 0,
      failed: 1,
      totalRows: 1,
      errorMessage: 'Some record writes failed or could not be confirmed.',
      rowIssues: [
        {
          rowNumber: 2,
          message: 'The write result was not confirmed for this row.',
        },
      ],
    };

    render(<ImportResultStep result={result} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn't complete the import/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/GraphQL|Resolver|SQL|IMPORT_PREFLIGHT/),
    ).not.toBeInTheDocument();
  });
});
