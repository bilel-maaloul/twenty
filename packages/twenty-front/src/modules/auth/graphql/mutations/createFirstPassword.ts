import { gql } from '@apollo/client';

import { AUTH_TOKEN_PAIR } from '@/auth/graphql/fragments/authFragments';

export const CREATE_FIRST_PASSWORD = gql`
  mutation CreateFirstPassword(
    $newPassword: String!
    $confirmPassword: String!
    $captchaToken: String
  ) {
    createFirstPassword(
      newPassword: $newPassword
      confirmPassword: $confirmPassword
      captchaToken: $captchaToken
    ) {
      tokens {
        ...AuthTokenPairFragment
      }
    }
  }
  ${AUTH_TOKEN_PAIR}
`;
