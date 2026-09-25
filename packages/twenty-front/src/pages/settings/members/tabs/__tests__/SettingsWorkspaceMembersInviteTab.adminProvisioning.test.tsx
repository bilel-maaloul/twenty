import { render, screen } from '@testing-library/react';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type ReactNode } from 'react';

import { SettingsWorkspaceMembersInviteTab } from '~/pages/settings/members/tabs/SettingsWorkspaceMembersInviteTab';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mockHasWorkspaceMembersPermission = { value: false };

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useQuery: () => ({
    data: { findWorkspaceInvitations: [] },
    error: undefined,
  }),
}));

jest.mock('@/settings/roles/components/SettingsRolesQueryEffect', () => ({
  SettingsRolesQueryEffect: () => null,
}));

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockHasWorkspaceMembersPermission.value,
}));

jest.mock('@/settings/roles/hooks/useSettingsAllRoles', () => ({
  useSettingsAllRoles: () => [],
}));

jest.mock('@/workspace/components/WorkspaceInviteTeam', () => ({
  WorkspaceInviteTeam: () => <div data-testid="existing-invitation-ui" />,
}));

jest.mock(
  '@/workspace/components/WorkspaceMemberTemporaryPasswordProvisioningForm',
  () => ({
    WorkspaceMemberTemporaryPasswordProvisioningForm: () => (
      <div data-testid="temporary-password-provisioning-ui" />
    ),
  }),
);

jest.mock('@/apollo/hooks/useSnackBarOnQueryError', () => ({
  useSnackBarOnQueryError: () => undefined,
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock('@/workspace-invitation/hooks/useDeleteWorkspaceInvitation', () => ({
  useDeleteWorkspaceInvitation: () => ({
    deleteWorkspaceInvitation: jest.fn(),
  }),
}));

jest.mock('@/workspace-invitation/hooks/useResendWorkspaceInvitation', () => ({
  useResendWorkspaceInvitation: () => ({ resendInvitation: jest.fn() }),
}));

jest.mock('@/workspace/components/WorkspaceInviteLink', () => ({
  WorkspaceInviteLink: () => null,
}));

jest.mock(
  '@/settings/security/components/approvedAccessDomains/SettingsApprovedAccessDomainsListCard',
  () => ({
    SettingsApprovedAccessDomainsListCard: () => null,
  }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ localeCatalog: undefined }),
}));

const MetadataAndApolloWrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});
const testI18n = setupI18n({ locale: 'en', messages: { en: {} } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={testI18n}>
    <MetadataAndApolloWrapper>{children}</MetadataAndApolloWrapper>
  </I18nProvider>
);

describe('SettingsWorkspaceMembersInviteTab administrator provisioning', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('preserves invitation UI and hides provisioning without WORKSPACE_MEMBERS permission', () => {
    mockHasWorkspaceMembersPermission.value = false;

    render(<SettingsWorkspaceMembersInviteTab />, { wrapper });

    expect(screen.getByTestId('existing-invitation-ui')).toBeInTheDocument();
    expect(
      screen.queryByTestId('temporary-password-provisioning-ui'),
    ).not.toBeInTheDocument();
  });

  it('shows provisioning only with WORKSPACE_MEMBERS permission', () => {
    mockHasWorkspaceMembersPermission.value = true;

    render(<SettingsWorkspaceMembersInviteTab />, { wrapper });

    expect(screen.getByTestId('existing-invitation-ui')).toBeInTheDocument();
    expect(
      screen.getByTestId('temporary-password-provisioning-ui'),
    ).toBeInTheDocument();
  });
});
