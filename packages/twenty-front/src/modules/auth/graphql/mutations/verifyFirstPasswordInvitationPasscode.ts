import { gql } from '@apollo/client';

export const VERIFY_FIRST_PASSWORD_INVITATION_PASSCODE = gql`
  mutation VerifyFirstPasswordInvitationPasscode(
    $email: String!
    $passcode: String!
    $origin: String!
  ) {
    verifyFirstPasswordInvitationPasscode(
      email: $email
      passcode: $passcode
      origin: $origin
    )
  }
`;
