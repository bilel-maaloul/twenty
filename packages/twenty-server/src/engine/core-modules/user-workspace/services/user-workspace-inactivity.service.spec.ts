import { UserSessionRevokedReason } from 'src/engine/core-modules/user-session/types/user-session-revoked-reason.type';
import { USER_WORKSPACE_INACTIVITY_PERIOD_IN_MS } from 'src/engine/core-modules/user-workspace/constants/user-workspace-inactivity.constant';

import { UserWorkspaceInactivityService } from './user-workspace-inactivity.service';

describe('UserWorkspaceInactivityService', () => {
  const queryBuilder = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    returning: jest.fn(),
    execute: jest.fn(),
  };
  const userWorkspaceRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const userSessionService = {
    revokeAllSessionsForUserWorkspaces: jest.fn(),
  };
  const coreEntityCacheService = {
    invalidate: jest.fn(),
    invalidateAndRecompute: jest.fn(),
  };
  const service = new UserWorkspaceInactivityService(
    userWorkspaceRepository as never,
    userSessionService as never,
    coreEntityCacheService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.update.mockReturnThis();
    queryBuilder.set.mockReturnThis();
    queryBuilder.where.mockReturnThis();
    queryBuilder.andWhere.mockReturnThis();
    queryBuilder.returning.mockReturnThis();
    queryBuilder.execute.mockResolvedValue({
      raw: [{ id: 'inactive-membership-id' }],
      affected: 1,
    });
    userSessionService.revokeAllSessionsForUserWorkspaces.mockResolvedValue(1);
    coreEntityCacheService.invalidate.mockResolvedValue(undefined);
    coreEntityCacheService.invalidateAndRecompute.mockResolvedValue(undefined);
  });

  it('suspends only active, non-deleted memberships older than the activity cutoff and revokes their sessions', async () => {
    const now = new Date('2026-09-29T00:00:00.000Z');

    await expect(service.suspendInactiveMemberships(now)).resolves.toBe(1);

    expect(queryBuilder.set).toHaveBeenCalledWith({ suspendedAt: now });
    expect(queryBuilder.where).toHaveBeenCalledWith('"deletedAt" IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      '"suspendedAt" IS NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      '"lastHumanInteractiveActivityAt" < :cutoff',
      {
        cutoff: new Date(
          now.getTime() - USER_WORKSPACE_INACTIVITY_PERIOD_IN_MS,
        ),
      },
    );
    expect(coreEntityCacheService.invalidate).toHaveBeenCalledWith(
      'userWorkspaceEntity',
      'inactive-membership-id',
    );
    expect(
      userSessionService.revokeAllSessionsForUserWorkspaces,
    ).toHaveBeenCalledWith({
      userWorkspaceIds: ['inactive-membership-id'],
      reason: UserSessionRevokedReason.MembershipSuspended,
    });
  });

  it('does not invalidate cache or revoke sessions when no membership is inactive', async () => {
    queryBuilder.execute.mockResolvedValueOnce({ raw: [], affected: 0 });

    await expect(service.suspendInactiveMemberships()).resolves.toBe(0);

    expect(coreEntityCacheService.invalidate).not.toHaveBeenCalled();
    expect(
      userSessionService.revokeAllSessionsForUserWorkspaces,
    ).not.toHaveBeenCalled();
  });

  it('reactivates only a suspended membership and refreshes its activity timestamp', async () => {
    queryBuilder.execute.mockResolvedValueOnce({ raw: [], affected: 1 });

    await expect(
      service.reactivateMembership('inactive-membership-id'),
    ).resolves.toBe(true);

    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        suspendedAt: null,
        lastHumanInteractiveActivityAt: expect.any(Date),
      }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '"suspendedAt" IS NOT NULL',
    );
    expect(coreEntityCacheService.invalidateAndRecompute).toHaveBeenCalledWith(
      'userWorkspaceEntity',
      'inactive-membership-id',
    );
  });

  it('reports persisted reactivation as successful when cache refresh fails', async () => {
    queryBuilder.execute.mockResolvedValueOnce({ raw: [], affected: 1 });
    coreEntityCacheService.invalidateAndRecompute.mockRejectedValueOnce(
      new Error('Cache unavailable'),
    );

    await expect(
      service.reactivateMembership('inactive-membership-id'),
    ).resolves.toBe(true);
  });
});
