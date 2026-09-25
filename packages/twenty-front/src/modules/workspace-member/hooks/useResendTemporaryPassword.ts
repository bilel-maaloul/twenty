import { useMutation } from '@apollo/client/react';

import { ResendTemporaryPasswordDocument } from '~/generated-metadata/graphql';

export const useResendTemporaryPassword = () => {
  const [mutate, { loading }] = useMutation(ResendTemporaryPasswordDocument);

  return {
    resendTemporaryPassword: (workspaceMemberId: string) =>
      mutate({ variables: { workspaceMemberId } }),
    loading,
  };
};
