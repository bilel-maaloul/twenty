import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { PASSWORD_LENGTH_REGEX, PASSWORD_REGEX } from 'twenty-shared/security';
import { IconCheck, IconX } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type PasswordRequirementsProps = {
  password: string;
  confirmPassword?: string;
};

const StyledRequirements = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  list-style: none;
  margin: ${themeCssVariables.spacing[2]} 0 0;
  padding: 0;
`;

const StyledRequirement = styled.li`
  align-items: center;
  color: ${themeCssVariables.color.red9};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};

  &[data-satisfied='true'] {
    color: ${themeCssVariables.color.green9};
  }
`;

const StyledRequirementStatus = styled.span`
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

export const PasswordRequirements = ({
  password,
  confirmPassword,
}: PasswordRequirementsProps) => {
  const { t } = useLingui();

  const requirements = [
    {
      label: t`8 to 50 characters`,
      isSatisfied: PASSWORD_LENGTH_REGEX.test(password),
    },
    {
      label: t`At least one uppercase letter`,
      isSatisfied: /[A-Z]/.test(password),
    },
    {
      label: t`At least one number`,
      isSatisfied: /\d/.test(password),
    },
    ...(confirmPassword === undefined
      ? []
      : [
          {
            label: t`Passwords match`,
            isSatisfied:
              confirmPassword.length > 0 && password === confirmPassword,
          },
        ]),
  ];

  return (
    <div>
      <div>{t`Password requirements`}</div>
      <StyledRequirements>
        {requirements.map(({ label, isSatisfied }) => {
          const StatusIcon = isSatisfied ? IconCheck : IconX;

          return (
            <StyledRequirement
              key={label}
              data-satisfied={isSatisfied}
              aria-label={`${label}: ${isSatisfied ? t`Satisfied` : t`Required`}`}
            >
              <StatusIcon size={14} aria-hidden="true" />
              <span>{label}</span>
              <StyledRequirementStatus>
                {isSatisfied ? t`Satisfied` : t`Required`}
              </StyledRequirementStatus>
            </StyledRequirement>
          );
        })}
      </StyledRequirements>
    </div>
  );
};
