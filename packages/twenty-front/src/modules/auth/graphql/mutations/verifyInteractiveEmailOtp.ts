import { gql } from '@apollo/client';

export const VERIFY_INTERACTIVE_EMAIL_OTP = gql`
  mutation VerifyInteractiveEmailOtp(
    $challengeId: String!
    $code: String!
    $origin: String!
  ) {
    verifyInteractiveEmailOtp(
      challengeId: $challengeId
      code: $code
      origin: $origin
    ) {
      tokens {
        ...AuthTokenPairFragment
      }
      availableWorkspaces {
        ...AvailableWorkspacesFragment
      }
      loginToken {
        ...AuthTokenFragment
      }
      workspaceUrls {
        ...WorkspaceUrlsFragment
      }
    }
  }
`;
