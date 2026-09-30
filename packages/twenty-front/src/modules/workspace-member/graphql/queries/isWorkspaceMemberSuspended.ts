import { gql } from '@apollo/client';

export const IS_WORKSPACE_MEMBER_SUSPENDED = gql`
  query IsWorkspaceMemberSuspended($workspaceMemberId: UUID!) {
    isWorkspaceMemberSuspended(workspaceMemberId: $workspaceMemberId)
  }
`;
