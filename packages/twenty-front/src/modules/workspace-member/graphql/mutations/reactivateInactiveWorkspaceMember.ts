import { gql } from '@apollo/client';

export const REACTIVATE_INACTIVE_WORKSPACE_MEMBER = gql`
  mutation ReactivateInactiveWorkspaceMember($workspaceMemberId: UUID!) {
    reactivateInactiveWorkspaceMember(workspaceMemberId: $workspaceMemberId)
  }
`;
