import { renderHook } from '@testing-library/react';

import { useProvisionWorkspaceMember } from '@/workspace-member/hooks/useProvisionWorkspaceMember';
import { ProvisionWorkspaceMemberDocument } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mutationCall = jest.fn();
const mockCacheEvict = jest.fn();
const mockCacheGc = jest.fn();

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({
    cache: { evict: mockCacheEvict, gc: mockCacheGc },
  }),
}));

jest.mock('@apollo/client/react', () => ({
  ...jest.requireActual('@apollo/client/react'),
  useMutation: () => [mutationCall, { loading: false }],
}));

const wrapper = getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] });

describe('useProvisionWorkspaceMember', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes workspace member data after provisioning and submits no credential fields', async () => {
    const variables = {
      email: 'person@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      roleId: 'role-id',
    };

    const { result } = renderHook(() => useProvisionWorkspaceMember(), {
      wrapper,
    });

    await result.current.provisionMember(variables);

    expect(mutationCall).toHaveBeenCalledWith({
      variables,
    });
    expect(mockCacheEvict).toHaveBeenCalledWith({
      id: 'ROOT_QUERY',
      fieldName: 'workspaceMembers',
    });
    expect(mockCacheGc).toHaveBeenCalledTimes(1);
    expect(mutationCall).toHaveBeenCalledWith(
      expect.not.objectContaining({
        temporaryPassword: expect.anything(),
        password: expect.anything(),
        credentialEpoch: expect.anything(),
      }),
    );
    expect(ProvisionWorkspaceMemberDocument).toBeDefined();
  });

  it('invalidates the Team query cache after an uncertain mutation failure', async () => {
    mutationCall.mockRejectedValueOnce(new Error('request outcome unknown'));

    const { result } = renderHook(() => useProvisionWorkspaceMember(), {
      wrapper,
    });

    await expect(
      result.current.provisionMember({
        email: 'person@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      }),
    ).rejects.toThrow('request outcome unknown');

    expect(mockCacheEvict).toHaveBeenCalledWith({
      id: 'ROOT_QUERY',
      fieldName: 'workspaceMembers',
    });
  });
});
