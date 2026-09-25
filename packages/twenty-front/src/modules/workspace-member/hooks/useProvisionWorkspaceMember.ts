import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  ProvisionWorkspaceMemberDocument,
  type ProvisionWorkspaceMemberMutationVariables,
} from '~/generated-metadata/graphql';

export const useProvisionWorkspaceMember = () => {
  const apolloCoreClient = useApolloCoreClient();
  const [provisionWorkspaceMember, { loading }] = useMutation(
    ProvisionWorkspaceMemberDocument,
  );

  const provisionMember = async (
    variables: ProvisionWorkspaceMemberMutationVariables,
  ) => {
    try {
      return await provisionWorkspaceMember({ variables });
    } finally {
      apolloCoreClient.cache.evict({
        id: 'ROOT_QUERY',
        fieldName: 'workspaceMembers',
      });
      apolloCoreClient.cache.gc();
    }
  };

  return { provisionMember, loading };
};
