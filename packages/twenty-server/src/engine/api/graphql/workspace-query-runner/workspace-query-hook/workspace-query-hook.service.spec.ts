import { type Module } from '@nestjs/core/injector/module';

import { type WorkspaceQueryHookExplorer } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.explorer';
import { WorkspaceQueryHookService } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.service';
import { WorkspaceQueryHookStorage } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/storage/workspace-query-hook.storage';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

describe('WorkspaceQueryHookService', () => {
  it('uses a hook-transformed filter without deep-merging filter arrays', async () => {
    const existingFilter = {
      or: [{ id: { eq: 'event-1' } }, { id: { eq: 'event-2' } }],
    };
    const transformedFilter = {
      and: [existingFilter, { or: [{ ownerId: { eq: 'member-1' } }] }],
    };
    const workspaceQueryHookStorage = {
      getWorkspaceQueryPreHookInstances: jest
        .fn()
        .mockReturnValue([
          { instance: {}, host: {} as Module, isRequestScoped: false },
        ]),
    } as unknown as WorkspaceQueryHookStorage;
    const workspaceQueryHookExplorer = {
      handlePreHook: jest.fn().mockResolvedValue({ filter: transformedFilter }),
    } as unknown as WorkspaceQueryHookExplorer;
    const service = new WorkspaceQueryHookService(
      workspaceQueryHookStorage,
      workspaceQueryHookExplorer,
    );

    const result = await service.executePreQueryHooks(
      buildSystemAuthContext('workspace-1'),
      'calendarEvent',
      'findMany',
      { filter: existingFilter },
    );

    expect(result.filter).toEqual(transformedFilter);
  });
});
