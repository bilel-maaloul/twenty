import { gql } from '@apollo/client';

export const CREATE_FIRST_PASSWORD = gql`
  mutation CreateFirstPassword(
    $newPassword: String!
    $confirmPassword: String!
  ) {
    createFirstPassword(
      newPassword: $newPassword
      confirmPassword: $confirmPassword
    )
  }
`;
