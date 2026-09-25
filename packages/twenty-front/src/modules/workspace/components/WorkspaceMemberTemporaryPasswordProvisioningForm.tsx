import { zodResolver } from '@hookform/resolvers/zod';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useProvisionWorkspaceMember } from '@/workspace-member/hooks/useProvisionWorkspaceMember';
import { type RoleWithPartialMembers } from '@/settings/roles/types/RoleWithPartialMembers';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Select } from '@/ui/input/components/Select';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { isDefined } from 'twenty-shared/utils';
import {
  IconLock,
  IconSend,
  IconUser,
  useIcons,
  type IconComponent,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { H2Title } from 'twenty-ui/typography';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { ProvisionWorkspaceMemberStatus } from '~/generated-metadata/graphql';

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  max-width: 900px;
`;

const StyledFieldsRow = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.div`
  flex: 1 1 180px;
  min-width: 0;
`;

const StyledRole = styled.div`
  flex: 1 1 180px;
  min-width: 180px;
`;

const validationSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  roleId: z.string().optional(),
});

type FormInput = z.infer<typeof validationSchema>;

type WorkspaceMemberTemporaryPasswordProvisioningFormProps = {
  roles: RoleWithPartialMembers[];
};

export const WorkspaceMemberTemporaryPasswordProvisioningForm = ({
  roles,
}: WorkspaceMemberTemporaryPasswordProvisioningFormProps) => {
  const { t } = useLingui();
  const { getIcon } = useIcons();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { provisionMember, loading } = useProvisionWorkspaceMember();

  const roleOptions: Array<{
    label: string;
    value: string;
    Icon?: IconComponent;
  }> = roles
    .filter((role) => role.canBeAssignedToUsers)
    .map((role) => ({
      label: role.label,
      value: role.id,
      Icon: getIcon(role.icon) ?? IconUser,
    }));

  const { control, handleSubmit, reset } = useForm<FormInput>({
    mode: 'onSubmit',
    resolver: zodResolver(validationSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      roleId: '',
    },
  });

  const submit = handleSubmit(
    async ({ email, firstName, lastName, roleId }) => {
      try {
        const { data } = await provisionMember({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          ...(roleId ? { roleId } : {}),
        });

        if (!isDefined(data)) {
          enqueueErrorSnackBar({
            message: t`Unable to add this member right now.`,
          });
          return;
        }

        switch (data.provisionWorkspaceMember.status) {
          case ProvisionWorkspaceMemberStatus.READY:
            enqueueSuccessSnackBar({
              message: t`Member access is ready. If this was a new account, sign-in instructions were sent by email.`,
            });
            reset();
            return;
          case ProvisionWorkspaceMemberStatus.DELIVERY_UNAVAILABLE:
            enqueueErrorSnackBar({
              message: t`Email delivery is unavailable. No new credential was created.`,
            });
            return;
          case ProvisionWorkspaceMemberStatus.UNAVAILABLE:
            enqueueErrorSnackBar({
              message: t`This member cannot be added right now.`,
            });
            return;
          case ProvisionWorkspaceMemberStatus.REVIEW_REQUIRED:
          default:
            enqueueErrorSnackBar({
              message: t`The operation needs review before it can be retried.`,
            });
            return;
        }
      } catch {
        enqueueErrorSnackBar({
          message: t`Unable to add this member right now.`,
        });
      }
    },
  );

  const emptyRoleOption = {
    label: t`Default role`,
    value: '',
    Icon: IconLock,
  };

  return (
    <Section>
      <H2Title
        title={t`Add member with temporary password`}
        description={t`Create workspace access. New accounts receive temporary sign-in instructions by email.`}
      />
      <StyledForm onSubmit={submit}>
        <StyledFieldsRow>
          <StyledInput>
            <Controller
              name="firstName"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  instanceId="workspace-member-first-name"
                  aria-label={t`First name`}
                  placeholder={t`First name`}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error ? t`Enter a first name` : undefined}
                  fullWidth
                />
              )}
            />
          </StyledInput>
          <StyledInput>
            <Controller
              name="lastName"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  instanceId="workspace-member-last-name"
                  aria-label={t`Last name`}
                  placeholder={t`Last name`}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error ? t`Enter a last name` : undefined}
                  fullWidth
                />
              )}
            />
          </StyledInput>
        </StyledFieldsRow>
        <StyledFieldsRow>
          <StyledInput>
            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <SettingsTextInput
                  instanceId="workspace-member-email"
                  aria-label={t`Email`}
                  placeholder={t`name@example.com`}
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error ? t`Enter a valid email` : undefined}
                  fullWidth
                />
              )}
            />
          </StyledInput>
          <StyledRole>
            <Controller
              name="roleId"
              control={control}
              render={({ field }) => (
                <Select
                  dropdownId="workspace-member-provisioning-role"
                  options={roleOptions}
                  emptyOption={emptyRoleOption}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  withSearchInput
                  fullWidth
                  disabled={roleOptions.length === 0}
                />
              )}
            />
          </StyledRole>
          <Button
            Icon={IconSend}
            variant="primary"
            accent="blue"
            title={t`Add member`}
            type="submit"
            disabled={loading}
          />
        </StyledFieldsRow>
      </StyledForm>
      <p>
        <Trans>The administrator does not choose or see the password.</Trans>
      </p>
    </Section>
  );
};
