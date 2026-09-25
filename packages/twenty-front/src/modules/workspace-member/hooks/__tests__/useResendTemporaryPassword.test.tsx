import { renderHook } from '@testing-library/react';

import { useResendTemporaryPassword } from '@/workspace-member/hooks/useResendTemporaryPassword';
import { ResendTemporaryPasswordDocument } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mutationCall = jest.fn();

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: () => [mutationCall, { loading: false }],
}));

const wrapper = getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] });

describe('useResendTemporaryPassword', () => {
  it('submits only the workspace member ID', async () => {
    const { result } = renderHook(() => useResendTemporaryPassword(), {
      wrapper,
    });

    await result.current.resendTemporaryPassword('workspace-member-id');

    expect(mutationCall).toHaveBeenCalledWith({
      variables: { workspaceMemberId: 'workspace-member-id' },
    });
    expect(ResendTemporaryPasswordDocument).toBeDefined();
  });
});
