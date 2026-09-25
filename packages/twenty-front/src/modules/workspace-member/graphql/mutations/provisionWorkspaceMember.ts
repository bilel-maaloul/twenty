import { gql } from '@apollo/client';

export const PROVISION_WORKSPACE_MEMBER = gql`
  mutation ProvisionWorkspaceMember(
    $email: String!
    $firstName: String!
    $lastName: String!
    $roleId: UUID
  ) {
    provisionWorkspaceMember(
      email: $email
      firstName: $firstName
      lastName: $lastName
      roleId: $roleId
    ) {
      status
    }
  }
`;
