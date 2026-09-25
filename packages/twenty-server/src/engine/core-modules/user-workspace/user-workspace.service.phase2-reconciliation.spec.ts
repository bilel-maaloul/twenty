import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('UserWorkspaceService Phase 2 reconciliation', () => {
  it('repairs missing workspace member and role relationships idempotently', async () => {
    const userWorkspace = {
      id: 'user-workspace-id',
      userId: 'user-id',
      workspaceId: 'workspace-id',
      defaultAvatarUrl: null,
    };
    let workspaceMemberExists = false;
    let roleExists = false;
    const workspaceMemberRepository = {
      findOne: jest.fn(async () =>
        workspaceMemberExists ? { id: 'workspace-member-id' } : null,
      ),
      insert: jest.fn(async () => {
        workspaceMemberExists = true;
      }),
    };
    const serviceDependencies = {
      userWorkspaceRepository: {
        findOneBy: jest.fn().mockResolvedValue(userWorkspace),
        findOneOrFail: jest.fn().mockResolvedValue(userWorkspace),
      },
      roleValidationService: {
        validateRoleAssignableToUsersOrThrow: jest
          .fn()
          .mockResolvedValue(undefined),
      },
      roleTargetRepository: {},
      userRoleService: {
        getRolesByUserWorkspaces: jest.fn(
          async () =>
            new Map([
              [userWorkspace.id, roleExists ? [{ id: 'role-id' }] : []],
            ]),
        ),
        assignRoleToManyUserWorkspace: jest.fn(async () => {
          roleExists = true;
        }),
      },
      workspaceOrmManager: {
        executeInWorkspaceContext: async (callback: () => Promise<unknown>) =>
          callback(),
        getRepository: jest.fn(() => workspaceMemberRepository),
      },
      onboardingService: {
        setOnboardingCreateProfilePending: jest
          .fn()
          .mockResolvedValue(undefined),
      },
    };
    const service = Object.assign(
      Object.create(UserWorkspaceService.prototype),
      serviceDependencies,
    ) as UserWorkspaceService;
    const user = {
      id: 'user-id',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      locale: 'en',
    } as UserEntity;
    const workspace = {
      id: 'workspace-id',
      defaultRoleId: 'role-id',
    } as WorkspaceEntity;

    await service.ensureUserIsInWorkspace(user, workspace, 'role-id');
    await service.ensureUserIsInWorkspace(user, workspace, 'role-id');

    expect(workspaceMemberRepository.insert).toHaveBeenCalledTimes(1);
    expect(
      serviceDependencies.userRoleService.assignRoleToManyUserWorkspace,
    ).toHaveBeenCalledTimes(1);
    expect(
      serviceDependencies.onboardingService.setOnboardingCreateProfilePending,
    ).toHaveBeenCalledTimes(1);
  });
});
