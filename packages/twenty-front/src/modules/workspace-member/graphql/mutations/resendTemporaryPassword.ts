import { gql } from '@apollo/client';

export const RESEND_TEMPORARY_PASSWORD = gql`
  mutation ResendTemporaryPassword($workspaceMemberId: UUID!) {
    resendTemporaryPassword(workspaceMemberId: $workspaceMemberId) {
      status
    }
  }
`;
