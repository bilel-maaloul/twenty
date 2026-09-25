import { useParams } from 'react-router-dom';
import { useDebouncedCallback } from 'use-debounce';

import { useImpersonationSession } from '@/auth/hooks/useImpersonationSession';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsRolesQueryEffect } from '@/settings/roles/components/SettingsRolesQueryEffect';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { SettingsTabBar } from '@/settings/components/layout/SettingsTabBar';
import { activeTabIdComponentState } from '@/ui/layout/tab-list/states/activeTabIdComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { IconInfoCircle, IconLock } from 'twenty-ui/icon';
import { ResendTemporaryPasswordStatus } from '~/generated-metadata/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useResendTemporaryPassword } from '@/workspace-member/hooks/useResendTemporaryPassword';
import { isImpersonatingState } from '@/auth/states/isImpersonatingState';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { MemberInfosTab } from '@/settings/members/components/MemberInfosTab';
import { MemberPermissionsTab } from '@/settings/members/components/MemberPermissionsTab';
import { useWorkspaceMemberRoles } from '@/settings/members/hooks/useWorkspaceMemberRoles';
import { type WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';
import { useMutation } from '@apollo/client/react';
import {
  DeleteUserWorkspaceDocument,
  ImpersonateDocument,
  PermissionFlagType,
} from '~/generated-metadata/graphql';

const SETTINGS_WORKSPACE_MEMBER_TABS = {
  COMPONENT_INSTANCE_ID: 'settings-workspace-member-tabs',
  TABS_IDS: {
    INFOS: 'infos',
    PERMISSIONS: 'permissions',
  },
};

const DELETE_MEMBER_MODAL_ID = 'workspace-member-delete-modal';
const RESEND_TEMPORARY_PASSWORD_MODAL_ID =
  'workspace-member-resend-temporary-password-modal';

export const SettingsWorkspaceMember = () => {
  const { workspaceMemberId = '' } = useParams();
  const navigateSettings = useNavigateSettings();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { openModal, closeModal } = useModal();
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { startImpersonating } = useImpersonationSession();
  const [impersonate] = useMutation(ImpersonateDocument);
  const isImpersonating = useAtomStateValue(isImpersonatingState);
  const canImpersonate =
    useHasPermissionFlag(PermissionFlagType.IMPERSONATE) && !isImpersonating;
  const canManageWorkspaceMembers = useHasPermissionFlag(
    PermissionFlagType.WORKSPACE_MEMBERS,
  );
  const { resendTemporaryPassword, loading: isResendingTemporaryPassword } =
    useResendTemporaryPassword();

  const {
    roles,
    allRoles,
    loading: rolesLoading,
  } = useWorkspaceMemberRoles(workspaceMemberId);

  const { record: member, loading } = useFindOneRecord<WorkspaceMember>({
    objectNameSingular: CoreObjectNameSingular.WorkspaceMember,
    objectRecordId: workspaceMemberId,
    recordGqlFields: {
      id: true,
      userId: true,
      name: { firstName: true, lastName: true },
      avatarUrl: true,
      userEmail: true,
    },
  });

  const tabListComponentId = `${SETTINGS_WORKSPACE_MEMBER_TABS.COMPONENT_INSTANCE_ID}-${workspaceMemberId}`;
  const activeTabId = useAtomComponentStateValue(
    activeTabIdComponentState,
    tabListComponentId,
  );

  const { updateOneRecord } = useUpdateOneRecord();

  const [deleteUserFromWorkspace, { loading: isDeleting }] = useMutation(
    DeleteUserWorkspaceDocument,
  );

  const debouncedUpdateName = useDebouncedCallback(
    async (firstName: string, lastName: string) => {
      if (
        !member?.id ||
        firstName.trim().length < 1 ||
        lastName.trim().length < 1
      ) {
        return;
      }
      try {
        await updateOneRecord({
          objectNameSingular: CoreObjectNameSingular.WorkspaceMember,
          idToUpdate: member.id,
          updateOneRecordInput: {
            name: { firstName, lastName },
          },
        });
      } catch (error) {
        enqueueErrorSnackBar({
          message:
            error instanceof Error
              ? error.message
              : t`Error while saving the name`,
        });
      }
    },
    400,
  );

  const handleDeleteMember = async () => {
    if (!member?.id) return;
    try {
      await deleteUserFromWorkspace({
        variables: { workspaceMemberIdToDelete: member.id },
      });
      enqueueSuccessSnackBar({ message: t`Member removed from workspace` });
      closeModal(DELETE_MEMBER_MODAL_ID);
      navigateSettings(SettingsPath.WorkspaceMembersPage);
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : t`Unable to delete member right now`,
      });
    }
  };

  const handleResendTemporaryPassword = async () => {
    if (!member?.id) return;

    try {
      const { data } = await resendTemporaryPassword(member.id);

      switch (data?.resendTemporaryPassword.status) {
        case ResendTemporaryPasswordStatus.SENT:
          enqueueSuccessSnackBar({
            message: t`Temporary sign-in instructions were sent by email.`,
          });
          return;
        case ResendTemporaryPasswordStatus.DELIVERY_UNAVAILABLE:
          enqueueErrorSnackBar({
            message: t`Email delivery is unavailable. No credential was changed.`,
          });
          return;
        case ResendTemporaryPasswordStatus.UNAVAILABLE:
          enqueueErrorSnackBar({
            message: t`Temporary-password resend is unavailable for this member.`,
          });
          return;
        case ResendTemporaryPasswordStatus.REVIEW_REQUIRED:
        default:
          enqueueErrorSnackBar({
            message: t`The operation needs review before it can be retried.`,
          });
          return;
      }
    } catch {
      enqueueErrorSnackBar({
        message: t`Unable to resend sign-in instructions right now.`,
      });
    }
  };

  const handleImpersonate = async () => {
    if (!member?.userId || !currentWorkspace?.id) {
      enqueueErrorSnackBar({
        message: t`Cannot impersonate selected user`,
        options: { duration: 2000 },
      });
      return;
    }

    if (!isDefined(currentUser?.id) || member.userId === currentUser.id) {
      enqueueErrorSnackBar({
        message: t`You cannot impersonate your own account`,
        options: { duration: 2000 },
      });

      return;
    }

    await impersonate({
      variables: {
        userId: member.userId,
        workspaceId: currentWorkspace.id,
      },
      onCompleted: async (data) => {
        const { loginToken } = data.impersonate;

        await startImpersonating(loginToken.token);
      },
      onError: () => {
        enqueueErrorSnackBar({
          message: t`Cannot impersonate selected user`,
          options: { duration: 2000 },
        });
      },
    });
  };

  const isLoading = loading || rolesLoading || !member;

  return (
    <>
      <SettingsRolesQueryEffect />
      {isLoading ? null : (
        <SettingsPageLayout
          title={`${member.name.firstName} ${member.name.lastName}`}
          links={[
            {
              children: t`Workspace`,
              href: getSettingsPath(SettingsPath.General),
            },
            {
              children: t`Members`,
              href: getSettingsPath(SettingsPath.WorkspaceMembersPage),
            },
            {
              children: `${member.name.firstName} ${member.name.lastName}`,
            },
          ]}
          secondaryBar={
            <SettingsTabBar
              tabs={[
                {
                  id: SETTINGS_WORKSPACE_MEMBER_TABS.TABS_IDS.INFOS,
                  title: t`Infos`,
                  Icon: IconInfoCircle,
                },
                {
                  id: SETTINGS_WORKSPACE_MEMBER_TABS.TABS_IDS.PERMISSIONS,
                  title: t`Permissions`,
                  Icon: IconLock,
                },
              ]}
              componentInstanceId={tabListComponentId}
            />
          }
        >
          <SettingsPageContainer>
            {activeTabId === SETTINGS_WORKSPACE_MEMBER_TABS.TABS_IDS.INFOS && (
              <MemberInfosTab
                member={member}
                onImpersonate={
                  canImpersonate &&
                  isDefined(member.userId) &&
                  isDefined(currentUser?.id) &&
                  member.userId !== currentUser.id
                    ? handleImpersonate
                    : undefined
                }
                onNameChange={debouncedUpdateName}
                onDelete={() => openModal(DELETE_MEMBER_MODAL_ID)}
                onResendTemporaryPassword={
                  canManageWorkspaceMembers
                    ? () => openModal(RESEND_TEMPORARY_PASSWORD_MODAL_ID)
                    : undefined
                }
              />
            )}

            {activeTabId ===
              SETTINGS_WORKSPACE_MEMBER_TABS.TABS_IDS.PERMISSIONS && (
              <MemberPermissionsTab
                member={member}
                roles={roles}
                allRoles={allRoles}
              />
            )}
          </SettingsPageContainer>

          <ConfirmationModal
            modalInstanceId={DELETE_MEMBER_MODAL_ID}
            title={t`Remove member from workspace`}
            subtitle={t`This action cannot be undone. This member will be removed and unassigned from their records. Their synced emails and calendars will stop syncing and be reassigned to you.`}
            onConfirmClick={handleDeleteMember}
            confirmButtonText={t`Remove member`}
            loading={isDeleting}
          />
          <ConfirmationModal
            modalInstanceId={RESEND_TEMPORARY_PASSWORD_MODAL_ID}
            title={t`Resend temporary password?`}
            subtitle={t`A new temporary password will replace the previous temporary password and be sent by email. The password will not be shown here.`}
            onConfirmClick={handleResendTemporaryPassword}
            confirmButtonText={t`Resend instructions`}
            confirmButtonAccent="blue"
            loading={isResendingTemporaryPassword}
          />
        </SettingsPageLayout>
      )}
    </>
  );
};
