import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type ReactNode } from 'react';

import { WorkspaceMemberTemporaryPasswordProvisioningForm } from '@/workspace/components/WorkspaceMemberTemporaryPasswordProvisioningForm';
import { useProvisionWorkspaceMember } from '@/workspace-member/hooks/useProvisionWorkspaceMember';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ProvisionWorkspaceMemberStatus } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

jest.mock('@/workspace-member/hooks/useProvisionWorkspaceMember', () => ({
  useProvisionWorkspaceMember: jest.fn(),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: jest.fn(),
}));

jest.mock('twenty-ui/icon', () => ({
  IconLock: () => null,
  IconSend: () => null,
  IconUser: () => null,
  useIcons: () => ({ getIcon: () => undefined }),
}));

jest.mock('@/ui/input/components/SettingsTextInput', () => ({
  SettingsTextInput: ({
    'aria-label': ariaLabel,
    value,
    onChange,
    placeholder,
  }: {
    'aria-label': string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    options,
    emptyOption,
    value,
    onChange,
  }: {
    options: Array<{ label: string; value: string }>;
    emptyOption: { label: string; value: string };
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="Role"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value={emptyOption.value}>{emptyOption.label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const provisionMember = jest.fn();
const enqueueErrorSnackBar = jest.fn();
const enqueueSuccessSnackBar = jest.fn();
const MetadataAndApolloWrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});
const testI18n = setupI18n({ locale: 'en', messages: { en: {} } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={testI18n}>
    <MetadataAndApolloWrapper>{children}</MetadataAndApolloWrapper>
  </I18nProvider>
);

const roles = [
  {
    id: 'role-id',
    label: 'Member role',
    icon: null,
    canBeAssignedToUsers: true,
    workspaceMembers: [],
  },
] as never;

describe('WorkspaceMemberTemporaryPasswordProvisioningForm', () => {
  beforeEach(() => {
    jest.mocked(useProvisionWorkspaceMember).mockReturnValue({
      provisionMember,
      loading: false,
    } as never);
    jest.mocked(useSnackBar).mockReturnValue({
      enqueueErrorSnackBar,
      enqueueSuccessSnackBar,
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('submits email, names and selected role only, then shows neutral success copy', async () => {
    provisionMember.mockResolvedValue({
      data: {
        provisionWorkspaceMember: {
          status: ProvisionWorkspaceMemberStatus.READY,
        },
      },
    });

    render(<WorkspaceMemberTemporaryPasswordProvisioningForm roles={roles} />, {
      wrapper,
    });

    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'role-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add member/ }));

    await waitFor(() =>
      expect(provisionMember).toHaveBeenCalledWith({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        roleId: 'role-id',
      }),
    );
    expect(enqueueSuccessSnackBar).toHaveBeenCalledWith({
      message:
        'Member access is ready. If this was a new account, sign-in instructions were sent by email.',
    });
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(JSON.stringify(provisionMember.mock.calls)).not.toMatch(
      /temporaryPassword|passwordHash|credentialEpoch/i,
    );
  });

  it('uses the default role when no role is selected', async () => {
    provisionMember.mockResolvedValue({
      data: {
        provisionWorkspaceMember: {
          status: ProvisionWorkspaceMemberStatus.READY,
        },
      },
    });

    render(<WorkspaceMemberTemporaryPasswordProvisioningForm roles={roles} />, {
      wrapper,
    });

    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add member/ }));

    await waitFor(() =>
      expect(provisionMember).toHaveBeenCalledWith({
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      }),
    );
  });

  it.each([
    [
      ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED,
      'The operation needs review before it can be retried.',
    ],
    [
      ProvisionWorkspaceMemberStatus.DELIVERY_UNAVAILABLE,
      'Email delivery is unavailable. No new credential was created.',
    ],
    [
      ProvisionWorkspaceMemberStatus.UNAVAILABLE,
      'This member cannot be added right now.',
    ],
  ])('shows safe feedback for %s', async (status, message) => {
    provisionMember.mockResolvedValue({
      data: { provisionWorkspaceMember: { status } },
    });

    render(<WorkspaceMemberTemporaryPasswordProvisioningForm roles={roles} />, {
      wrapper,
    });
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Jane' },
    });
    fireEvent.change(screen.getByLabelText('Last name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add member/ }));

    await waitFor(() =>
      expect(enqueueErrorSnackBar).toHaveBeenCalledWith({ message }),
    );
  });
});
