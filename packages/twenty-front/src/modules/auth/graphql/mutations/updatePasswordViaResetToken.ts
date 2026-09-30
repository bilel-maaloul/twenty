import { gql } from '@apollo/client';

export const UPDATE_PASSWORD_VIA_RESET_TOKEN = gql`
  mutation UpdatePasswordViaResetToken(
    $token: String!
    $newPassword: String!
    $captchaToken: String
  ) {
    updatePasswordViaResetToken(
      passwordResetToken: $token
      newPassword: $newPassword
      captchaToken: $captchaToken
    ) {
      success
    }
  }
`;
