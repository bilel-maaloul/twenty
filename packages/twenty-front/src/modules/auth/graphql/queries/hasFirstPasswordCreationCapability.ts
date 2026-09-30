import { gql } from '@apollo/client';

export const HAS_FIRST_PASSWORD_CREATION_CAPABILITY = gql`
  query HasFirstPasswordCreationCapability {
    hasFirstPasswordCreationCapability
  }
`;
