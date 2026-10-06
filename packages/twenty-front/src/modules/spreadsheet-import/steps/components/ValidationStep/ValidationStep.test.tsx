import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { type DialogOptions } from '@/ui/feedback/dialog-manager/types/DialogOptions';
import { useSpreadsheetImportInternal } from '@/spreadsheet-import/hooks/useSpreadsheetImportInternal';
import { SpreadsheetImportStepType } from '@/spreadsheet-import/steps/types/SpreadsheetImportStepType';
import { ValidationStep } from '@/spreadsheet-import/steps/components/ValidationStep/ValidationStep';
import { type ImportedStructuredRow } from '@/spreadsheet-import/types';
import { getSpreadsheetImportDuplicateGroupId } from '@/spreadsheet-import/utils/spreadsheetImportDuplicateResolution';

const mockEnqueueDialog = jest.fn();
const mockPreflightStepHook = jest.fn();

jest.mock('transliteration', () => ({
  transliterate: (value: string) => value,
  slugify: (value: string) => value,
}));
jest.mock('react-data-grid', () => ({ useRowSelection: jest.fn() }));
jest.mock('@lingui/react', () => ({
  ...jest.requireActual('@lingui/react'),
  I18nProvider: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    i18n: {
      _: (descriptor: { message: string }, values?: Record<string, unknown>) =>
        descriptor.message.replace(/\{(\w+)\}/g, (_placeholder, key: string) =>
          String(values?.[key] ?? ''),
        ),
    },
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog: mockEnqueueDialog }),
}));
jest.mock('@/spreadsheet-import/hooks/useHideStepBar', () => ({
  useHideStepBar: () => jest.fn(),
}));
jest.mock('@/spreadsheet-import/hooks/useSpreadsheetImportInternal', () => ({
  useSpreadsheetImportInternal: jest.fn(),
}));
jest.mock('@/spreadsheet-import/components/StepNavigationButton', () => ({
  StepNavigationButton: ({
    continueTitle,
    isContinueDisabled,
    onContinue,
  }: {
    continueTitle: string;
    isContinueDisabled: boolean;
    onContinue: () => void;
  }) => (
    <button disabled={isContinueDisabled} onClick={onContinue}>
      {continueTitle}
    </button>
  ),
}));
jest.mock('@/spreadsheet-import/components/SpreadsheetImportTable', () => ({
  SpreadsheetImportTable: ({
    rows,
    columns,
    onRowsChange,
  }: {
    rows: ImportedStructuredRow[];
    columns: Array<{
      key: string;
      name?: string;
      renderCell?: (props: { row: ImportedStructuredRow }) => ReactNode;
    }>;
    onRowsChange?: (
      rows: ImportedStructuredRow[],
      changedData: { indexes: number[] },
    ) => void;
  }) => (
    <div>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex}>
          {columns
            .filter(({ key }) => !key.startsWith('__') && key !== 'select-row')
            .map((column) => (
              <input
                key={column.key}
                aria-label={`Edit ${column.name ?? column.key}`}
                value={String(row[column.key] ?? '')}
                onChange={(event) =>
                  onRowsChange?.(
                    rows.map((currentRow, currentIndex) =>
                      currentIndex === rowIndex
                        ? { ...currentRow, [column.key]: event.target.value }
                        : currentRow,
                    ),
                    { indexes: [rowIndex] },
                  )
                }
              />
            ))}
          {columns
            .filter(({ key }) => key === '__preflight-status')
            .map((column) => (
              <div key={column.key}>{column.renderCell?.({ row })}</div>
            ))}
        </div>
      ))}
    </div>
  ),
}));
jest.mock('twenty-ui/surfaces', () => ({
  ModalContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AppTooltip: () => null,
}));

const createDuplicateTableHook = () => {
  const group = {
    kind: 'unique-constraint' as const,
    fields: [{ label: 'Domain Name', value: 'shared.example' }],
    rows: [
      { rowNumber: 2, label: 'Company A' },
      { rowNumber: 3, label: 'Company B' },
    ],
  };
  const duplicateGroup = {
    ...group,
    id: getSpreadsheetImportDuplicateGroupId(group),
  };

  return (rows: ImportedStructuredRow[]) =>
    rows.map((row, index) => ({
      ...row,
      __duplicateInFile: true,
      __duplicateInFileGroups: JSON.stringify([duplicateGroup]),
      __duplicateInFileRowNumber: String(index + 2),
    }));
};

describe('ValidationStep duplicate resolution', () => {
  const setCurrentStepState = jest.fn();
  const preflightStepHook = mockPreflightStepHook as jest.MockedFunction<
    NonNullable<
      ReturnType<typeof useSpreadsheetImportInternal>['preflightStepHook']
    >
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnqueueDialog.mockImplementation(() => undefined);
    preflightStepHook.mockImplementation(async (rows) =>
      rows.map((row) => ({
        rowId: row.__index,
        status: 'NEW',
        matchedRecordIds: [],
        matchedConstraintIds: [],
        matchedConstraintNames: [],
        changedFieldNames: [],
        uncomparableFieldNames: [],
        fieldDifferences: [],
      })),
    );
    jest.mocked(useSpreadsheetImportInternal).mockReturnValue({
      spreadsheetImportFields: [],
      preflightStepHook,
      onSubmit: jest.fn(),
      onClose: jest.fn(),
      onAbortSubmit: jest.fn(),
      availableFieldMetadataItems: [],
      rowHook: undefined,
      tableHook: createDuplicateTableHook(),
    } as never);
  });

  const renderValidationStep = () =>
    render(
      <ValidationStep
        initialData={[{ name: 'Company A' }, { name: 'Company B' }]}
        importedColumns={[]}
        file={new File([], 'companies.xlsx')}
        onBack={jest.fn()}
        setCurrentStepState={setCurrentStepState}
      />,
    );

  it('shows a no-op result for all exact matches without submitting a write', async () => {
    const onSubmit = jest.fn();
    jest.mocked(useSpreadsheetImportInternal).mockReturnValue({
      spreadsheetImportFields: [],
      preflightStepHook: jest.fn(async (rows: ImportedStructuredRow[]) =>
        rows.map((row) => ({
          rowId: row.__index,
          status: 'EXACT_EXISTING_MATCH' as const,
          existingRecordId: `record-${row.__index}`,
          matchedRecordIds: [`record-${row.__index}`],
          matchedConstraintIds: [],
          matchedConstraintNames: [],
          changedFieldNames: [],
          uncomparableFieldNames: [],
          fieldDifferences: [],
        })),
      ),
      onSubmit,
      onClose: jest.fn(),
      onAbortSubmit: jest.fn(),
      availableFieldMetadataItems: [],
      rowHook: undefined,
      tableHook: undefined,
    } as never);

    render(
      <ValidationStep
        initialData={[{ name: 'Company A' }, { name: 'Company B' }]}
        importedColumns={[]}
        file={new File([], 'companies.xlsx')}
        onBack={jest.fn()}
        setCurrentStepState={setCurrentStepState}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Nothing new to import')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(setCurrentStepState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SpreadsheetImportStepType.importResult,
        result: expect.objectContaining({
          outcome: 'NOTHING_TO_IMPORT',
          skippedExisting: 2,
          created: 0,
          updated: 0,
        }),
      }),
    );
  });

  it('blocks confirmation while unresolved and preflights only the explicitly selected survivor', async () => {
    renderValidationStep();

    expect(
      screen.getByText('Duplicate records need your decision'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(preflightStepHook).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByText('Resolve duplicate group')[0]);

    const dialog = mockEnqueueDialog.mock.calls[0][0] as Omit<
      DialogOptions,
      'id'
    >;
    const keepFirstRow = dialog.buttons?.find(
      ({ title }) => title === 'Keep row 2 — Domain Name',
    );

    await act(async () => keepFirstRow?.onClick?.(undefined as never));

    await waitFor(() => expect(preflightStepHook).toHaveBeenCalledTimes(1));
    expect(preflightStepHook.mock.calls[0][0]).toHaveLength(1);
    expect(preflightStepHook.mock.calls[0][0][0]).toMatchObject({
      name: 'Company A',
      __duplicateInFileRowNumber: '2',
    });
    await waitFor(() =>
      expect(screen.getByText(/Ready to import/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    expect(
      screen.getByText(/Duplicate in uploaded file — resolved; skip row 3/),
    ).toBeInTheDocument();
  });

  it('allows Skip all and reports every group row as explicitly skipped', async () => {
    renderValidationStep();
    await userEvent.click(screen.getAllByText('Resolve duplicate group')[0]);

    const dialog = mockEnqueueDialog.mock.calls[0][0] as Omit<
      DialogOptions,
      'id'
    >;
    const skipAll = dialog.buttons?.find(
      ({ title }) => title === 'Skip all — Domain Name',
    );

    await act(async () => skipAll?.onClick?.(undefined as never));

    expect(preflightStepHook).not.toHaveBeenCalled();
    expect(screen.getByText(/Ready to import/)).toBeInTheDocument();
    expect(screen.getAllByText(/resolved; skip all/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('revalidates an edited invalid value and preflights the corrected row', async () => {
    jest.mocked(useSpreadsheetImportInternal).mockReturnValue({
      spreadsheetImportFields: [
        {
          Icon: null,
          label: 'Website',
          key: 'website',
          fieldMetadataItemId: 'website-id',
          fieldType: { type: 'input' },
          fieldMetadataType: 'TEXT',
          isNestedField: false,
          fieldValidationDefinitions: [
            {
              rule: 'function',
              isValid: (value: string) => value === 'valid.example',
              errorMessage: 'Website must be valid',
              level: 'error',
            },
          ],
        },
      ],
      preflightStepHook,
      onSubmit: jest.fn(),
      onClose: jest.fn(),
      onAbortSubmit: jest.fn(),
      availableFieldMetadataItems: [],
      rowHook: undefined,
      tableHook: undefined,
    } as never);

    render(
      <ValidationStep
        initialData={[{ website: 'invalid.example' }]}
        importedColumns={[{ type: 2, value: 'website' }] as never}
        file={new File([], 'companies.xlsx')}
        onBack={jest.fn()}
        setCurrentStepState={setCurrentStepState}
      />,
    );

    expect(
      screen.getByText('Some data needs your attention'),
    ).toBeInTheDocument();
    expect(preflightStepHook).not.toHaveBeenCalled();

    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Edit Website' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Edit Website' }),
      'valid.example',
    );

    await waitFor(() => expect(preflightStepHook).toHaveBeenCalled());
    expect(preflightStepHook.mock.calls.at(-1)?.[0]).toMatchObject([
      { website: 'valid.example' },
    ]);
    await waitFor(() =>
      expect(screen.getByText('New — will be created')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('Some data needs your attention'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('blocks confirmation while a blocking invalid row has no decision', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    jest.mocked(useSpreadsheetImportInternal).mockReturnValue({
      spreadsheetImportFields: [
        {
          Icon: null,
          label: 'Website',
          key: 'website',
          fieldMetadataItemId: 'website-id',
          fieldType: { type: 'input' },
          fieldMetadataType: 'TEXT',
          isNestedField: false,
          fieldValidationDefinitions: [
            {
              rule: 'function',
              isValid: (value: string) => value === 'valid.example',
              errorMessage: 'Website must be valid',
              level: 'error',
            },
          ],
        },
      ],
      preflightStepHook,
      onSubmit,
      onClose: jest.fn(),
      onAbortSubmit: jest.fn(),
      availableFieldMetadataItems: [],
      rowHook: undefined,
      tableHook: undefined,
    } as never);

    render(
      <ValidationStep
        initialData={[
          { website: 'invalid.example' },
          { website: 'valid.example' },
        ]}
        importedColumns={[{ type: 2, value: 'website' }] as never}
        file={new File([], 'companies.xlsx')}
        onBack={jest.fn()}
        setCurrentStepState={setCurrentStepState}
      />,
    );

    expect(
      screen.getByText('Some data needs your attention'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('New — will be created')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    const confirmation = mockEnqueueDialog.mock.calls.at(-1)?.[0] as
      Omit<DialogOptions, 'id'> | undefined;
    expect(confirmation?.message).toContain('Correct invalid values');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
