import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { type ReactNode } from 'react';

import { SettingsWorkspaceMember } from '~/pages/settings/members/SettingsWorkspaceMember';
import { useResendTemporaryPassword } from '@/workspace-member/hooks/useResendTemporaryPassword';
import { ResendTemporaryPasswordStatus } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mockMember = {
  id: 'workspace-member-id',
  userId: 'user-id',
  name: { firstName: 'Jane', lastName: 'Doe' },
  userEmail: 'jane@example.com',
};
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockResendTemporaryPassword = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockUseHasPermissionFlag = jest.fn();
const mockUseAtomStateValue = jest.fn();
const mockUseMutation = jest.fn();
const mockHasWorkspaceMembersPermission = { value: true };

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ workspaceMemberId: 'workspace-member-id' }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ record: mockMember, loading: false }),
}));

jest.mock('@/settings/members/hooks/useWorkspaceMemberRoles', () => ({
  useWorkspaceMemberRoles: () => ({ roles: [], allRoles: [], loading: false }),
}));

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: (permissionFlag: string) =>
    mockUseHasPermissionFlag(permissionFlag),
}));

jest.mock('@/workspace-member/hooks/useResendTemporaryPassword', () => ({
  useResendTemporaryPassword: jest.fn(),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockUseAtomStateValue(),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => 'infos',
  }),
);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal, closeModal: mockCloseModal }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    modalInstanceId,
    title,
    confirmButtonText,
    onConfirmClick,
  }: {
    modalInstanceId: string;
    title: string;
    confirmButtonText: string;
    onConfirmClick: () => void;
  }) => (
    <button
      data-modal-id={modalInstanceId}
      aria-label={title}
      onClick={onConfirmClick}
    >
      {confirmButtonText}
    </button>
  ),
}));

jest.mock('@/settings/members/components/MemberInfosTab', () => ({
  MemberInfosTab: ({
    onResendTemporaryPassword,
  }: {
    onResendTemporaryPassword?: () => void;
  }) =>
    onResendTemporaryPassword ? (
      <button onClick={onResendTemporaryPassword}>
        Resend temporary password
      </button>
    ) : (
      <div>Member settings</div>
    ),
}));

jest.mock('@/settings/members/components/MemberPermissionsTab', () => ({
  MemberPermissionsTab: () => null,
}));

jest.mock('@/settings/roles/components/SettingsRolesQueryEffect', () => ({
  SettingsRolesQueryEffect: () => null,
}));

jest.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@/settings/components/layout/SettingsTabBar', () => ({
  SettingsTabBar: () => null,
}));

jest.mock('@/auth/hooks/useImpersonationSession', () => ({
  useImpersonationSession: () => ({ startImpersonating: jest.fn() }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: jest.fn() }),
}));

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: () => mockUseMutation(),
}));

jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => jest.fn(),
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

describe('SettingsWorkspaceMember temporary-password action', () => {
  beforeEach(() => {
    mockUseHasPermissionFlag.mockImplementation(
      (permissionFlag: string) =>
        permissionFlag === 'WORKSPACE_MEMBERS' &&
        mockHasWorkspaceMembersPermission.value,
    );
    mockUseAtomStateValue
      .mockReset()
      .mockReturnValueOnce({ id: 'admin-user-id' })
      .mockReturnValueOnce({ id: 'workspace-id' })
      .mockReturnValueOnce(false);
    mockUseMutation.mockReturnValue([jest.fn(), { loading: false }]);
    jest.mocked(useResendTemporaryPassword).mockReturnValue({
      resendTemporaryPassword: mockResendTemporaryPassword,
      loading: false,
    } as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the resend action only for members with workspace-member permission', () => {
    mockHasWorkspaceMembersPermission.value = false;
    const { rerender } = render(<SettingsWorkspaceMember />, { wrapper });

    expect(
      screen.queryByRole('button', { name: 'Resend temporary password' }),
    ).not.toBeInTheDocument();

    mockHasWorkspaceMembersPermission.value = true;
    rerender(<SettingsWorkspaceMember />);

    expect(
      screen.getByRole('button', { name: 'Resend temporary password' }),
    ).toBeInTheDocument();
  });

  it('requires confirmation, sends only the member id, and shows success without displaying a password', async () => {
    mockHasWorkspaceMembersPermission.value = true;
    mockResendTemporaryPassword.mockResolvedValue({
      data: {
        resendTemporaryPassword: { status: ResendTemporaryPasswordStatus.SENT },
      },
    });
    render(<SettingsWorkspaceMember />, { wrapper });

    fireEvent.click(
      screen.getByRole('button', { name: 'Resend temporary password' }),
    );
    expect(mockOpenModal).toHaveBeenCalledWith(
      'workspace-member-resend-temporary-password-modal',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Resend temporary password?' }),
    );

    await waitFor(() =>
      expect(mockResendTemporaryPassword).toHaveBeenCalledWith(
        'workspace-member-id',
      ),
    );
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message: 'Temporary sign-in instructions were sent by email.',
    });
    expect(
      screen.queryByRole('textbox', { name: /password/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      ResendTemporaryPasswordStatus.UNAVAILABLE,
      'Temporary-password resend is unavailable for this member.',
    ],
    [
      ResendTemporaryPasswordStatus.REVIEW_REQUIRED,
      'The operation needs review before it can be retried.',
    ],
    [
      ResendTemporaryPasswordStatus.DELIVERY_UNAVAILABLE,
      'Email delivery is unavailable. No credential was changed.',
    ],
  ])(
    'shows sanitized feedback for resend status %s',
    async (status, message) => {
      mockHasWorkspaceMembersPermission.value = true;
      mockResendTemporaryPassword.mockResolvedValue({
        data: { resendTemporaryPassword: { status } },
      });
      render(<SettingsWorkspaceMember />, { wrapper });

      fireEvent.click(
        screen.getByRole('button', { name: 'Resend temporary password?' }),
      );

      await waitFor(() =>
        expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({ message }),
      );
    },
  );
});
