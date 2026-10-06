import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { FieldMetadataType } from '~/generated-metadata/graphql';

import { generatePreflightColumns } from '@/spreadsheet-import/steps/components/ValidationStep/components/columns';
import {
  type SpreadsheetImportDuplicateGroup,
  type SpreadsheetImportPreflightResult,
} from '@/spreadsheet-import/types';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { type DialogOptions } from '@/ui/feedback/dialog-manager/types/DialogOptions';

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: jest.fn(),
}));
jest.mock('react-data-grid', () => ({ useRowSelection: jest.fn() }));
jest.mock('transliteration', () => ({
  transliterate: (value: string) => value,
  slugify: (value: string) => value,
}));

describe('spreadsheet import difference review', () => {
  const enqueueDialog = jest.fn();

  beforeEach(() => {
    jest.mocked(useDialogManager).mockReturnValue({
      enqueueDialog,
      closeDialog: jest.fn(),
    });
    enqueueDialog.mockClear();
  });

  it('exposes the CRM and empty Excel values with a safe default choice', async () => {
    const difference: SpreadsheetImportPreflightResult['fieldDifferences'][number] =
      {
        fieldMetadataId: 'short-name-id',
        fieldName: 'nomCourt',
        subFieldPath: [],
        existingValue: 'ABC',
        incomingValue: null,
        sourceState: 'EMPTY',
        clearAllowed: true,
        comparable: true,
      };
    const preflight: SpreadsheetImportPreflightResult = {
      rowId: 'row-1',
      status: 'EXISTING_WITH_CHANGES',
      existingRecordId: 'record-1',
      matchedRecordIds: ['record-1'],
      matchedConstraintIds: [],
      matchedConstraintNames: [],
      changedFieldNames: ['nomCourt'],
      uncomparableFieldNames: [],
      fieldDifferences: [difference],
    };
    const columns = generatePreflightColumns({
      onActionChange: jest.fn(),
      onDecisionChange: jest.fn(),
      fields: [
        {
          Icon: null,
          label: 'Nom court',
          key: 'nomCourt',
          fieldMetadataItemId: 'short-name-id',
          fieldType: { type: 'input' },
          fieldMetadataType: FieldMetadataType.TEXT,
          isNestedField: false,
        },
      ],
    });
    const reviewColumn = columns.find(
      ({ key }) => key === '__preflight-review',
    );
    const reviewCell = reviewColumn?.renderCell?.({
      row: {
        __index: 'row-1',
        __preflight: preflight,
        __fieldDecisions: '{}',
      },
    } as never);

    render(reviewCell as ReactElement);

    await userEvent.click(
      screen.getByRole('button', { name: /^View differences/ }),
    );

    const dialog = enqueueDialog.mock.calls[0][0] as Omit<DialogOptions, 'id'>;
    render(dialog.children as ReactElement);

    expect(screen.getByText('Nom court')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('CRM value: ABC');
    expect(document.body).toHaveTextContent('Excel value: Empty');
    expect(document.body).toHaveTextContent('Keep existing');
    expect(dialog.message).toContain('Blank Excel cells keep the CRM value');
  });

  it('shows every validation field, incoming value, and reason for an invalid row', async () => {
    const onDecisionChange = jest.fn();
    const onValueChange = jest.fn();
    const onActionChange = jest.fn();
    const fields = [
      {
        Icon: null,
        label: 'Company Name',
        key: 'name',
        fieldMetadataItemId: 'name-id',
        fieldType: { type: 'input' as const },
        fieldMetadataType: FieldMetadataType.TEXT,
        isNestedField: false,
        isLabelIdentifier: true,
      },
      {
        Icon: null,
        label: 'Domain Name / Link URL',
        key: 'domainName',
        fieldMetadataItemId: 'domain-id',
        fieldType: { type: 'input' as const },
        fieldMetadataType: FieldMetadataType.LINKS,
        isNestedField: true,
        canIgnoreIncomingValue: true,
      },
      {
        Icon: null,
        label: 'Email',
        key: 'email',
        fieldMetadataItemId: 'email-id',
        fieldType: { type: 'input' as const },
        fieldMetadataType: FieldMetadataType.EMAILS,
        isNestedField: true,
      },
    ];
    const columns = generatePreflightColumns({
      onActionChange,
      onDecisionChange,
      onValueChange,
      fields,
    });
    const actionColumn = columns.find(
      ({ key }) => key === '__preflight-action',
    );
    const actionCell = actionColumn?.renderCell?.({
      row: {
        __index: 'invalid-row',
        name: 'STE AGRO ZITEX',
        domainName: 'groupe_zitex.com.tn',
        email: 'not-an-email',
        __errors: {
          domainName: {
            level: 'error',
            message: 'Domain Name / Link URL is not a valid URL',
          },
          email: { level: 'error', message: 'Email is not a valid email' },
        },
      },
    } as never);

    render(actionCell as ReactElement);
    await userEvent.click(
      screen.getByRole('button', { name: /^Review & decide/ }),
    );

    const dialog = enqueueDialog.mock.calls[0][0] as Omit<DialogOptions, 'id'>;
    render(dialog.children as ReactElement);

    expect(
      screen.getByText('Company Name: STE AGRO ZITEX'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Field: Domain Name / Link URL'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Excel value: groupe_zitex.com.tn'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Reason: Domain Name / Link URL is not a valid URL'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Correct Domain Name / Link URL' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Use corrected value/ })[0],
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: /^Ignore Domain Name \/ Link URL and import the record/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Accept this value')).not.toBeInTheDocument();
    expect(screen.getByText('Field: Email')).toBeInTheDocument();
    expect(screen.getByText('Excel value: not-an-email')).toBeInTheDocument();
    expect(
      screen.getByText('Reason: Email is not a valid email'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Skip STE AGRO ZITEX: this record will not be created or updated.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: /^Ignore Domain Name \/ Link URL and import the record/,
      }),
    );
    expect(onDecisionChange).toHaveBeenCalledWith(
      'invalid-row',
      'domainName',
      'IGNORE_INCOMING_FIELD',
    );
    expect(
      screen.getByText(
        'This field will not be imported. The rest of the record will still be imported.',
      ),
    ).toBeInTheDocument();

    await userEvent.clear(
      screen.getAllByRole('textbox', {
        name: 'Correct Domain Name / Link URL',
      })[0],
    );
    await userEvent.type(
      screen.getAllByRole('textbox', {
        name: 'Correct Domain Name / Link URL',
      })[0],
      'https://groupe-zitex.com.tn',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: /^Use corrected value/ })[0],
    );
    expect(onValueChange).toHaveBeenCalledWith(
      'invalid-row',
      'domainName',
      'https://groupe-zitex.com.tn',
    );
    const skipRecord = dialog.buttons?.find(({ title }) =>
      (title ?? '').startsWith('Skip STE AGRO ZITEX'),
    );
    skipRecord?.onClick?.(undefined as never);
    expect(onActionChange).toHaveBeenCalledWith('invalid-row', 'SKIP_RECORD');
  });

  it('explains a metadata-unique duplicate and shows the other row in its group', async () => {
    const duplicateGroup: SpreadsheetImportDuplicateGroup = {
      id: 'domain-duplicate-group',
      kind: 'unique-constraint',
      fields: [{ label: 'ID source Tunisie Industrie', value: '123' }],
      rows: [
        { rowNumber: 2, label: 'Company A' },
        { rowNumber: 43, label: 'Company B' },
      ],
    };
    const columns = generatePreflightColumns({
      onActionChange: jest.fn(),
      onDecisionChange: jest.fn(),
      fields: [],
    });
    const statusColumn = columns.find(
      ({ key }) => key === '__preflight-status',
    );
    const statusCell = statusColumn?.renderCell?.({
      row: {
        __index: 'generated-row-key',
        __duplicateInFile: true,
        __duplicateInFileRowNumber: '2',
        __duplicateInFileGroups: JSON.stringify([duplicateGroup]),
      },
    } as never);

    render(statusCell as ReactElement);

    expect(
      screen.getByText(/ID source Tunisie Industrie: 123/),
    ).toBeInTheDocument();
    expect(screen.getByText(/also row 43 — Company B/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /^Resolve duplicate group/ }),
    );

    const dialog = enqueueDialog.mock.calls[0][0] as Omit<DialogOptions, 'id'>;
    render(dialog.children as ReactElement);

    expect(
      screen.getByText('ID source Tunisie Industrie: 123'),
    ).toBeInTheDocument();
    expect(screen.getByText('Uploaded row 2 — Company A')).toBeInTheDocument();
    expect(screen.getByText('Uploaded row 43 — Company B')).toBeInTheDocument();
    expect(
      dialog.buttons?.some(
        ({ title }) => title === 'Keep row 2 — ID source Tunisie Industrie',
      ),
    ).toBe(true);
    expect(
      dialog.buttons?.some(
        ({ title }) => title === 'Skip all — ID source Tunisie Industrie',
      ),
    ).toBe(true);
    expect(dialog.buttons?.some(({ title }) => title === 'Create anyway')).toBe(
      false,
    );
  });

  it('keeps a chosen field decision visible while another invalid field remains', () => {
    const domainField = {
      Icon: null,
      label: 'Domain Name',
      key: 'domainName',
      fieldMetadataItemId: 'domain-id',
      fieldType: { type: 'input' as const },
      fieldMetadataType: FieldMetadataType.LINKS,
      isNestedField: true,
      canIgnoreIncomingValue: true,
    };
    const emailField = {
      ...domainField,
      label: 'Email',
      key: 'email',
      fieldMetadataItemId: 'email-id',
      canIgnoreIncomingValue: false,
    };
    const columns = generatePreflightColumns({
      onActionChange: jest.fn(),
      onDecisionChange: jest.fn(),
      fields: [domainField, emailField],
    });
    const actionColumn = columns.find(
      ({ key }) => key === '__preflight-action',
    );
    const actionCell = actionColumn?.renderCell?.({
      row: {
        __index: 'multi-error-row',
        domainName: 'groupe_zitex.com.tn',
        email: 'invalid-email',
        __fieldDecisions: JSON.stringify({
          domainName: 'IGNORE_INCOMING_FIELD',
        }),
        __errors: {
          domainName: { level: 'error', message: 'Invalid URL' },
          email: { level: 'error', message: 'Invalid email' },
        },
      },
    } as never);

    render(actionCell as ReactElement);

    expect(screen.getByText('Domain Name ignored')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Review remaining issues/ }),
    ).toBeInTheDocument();
  });
});
