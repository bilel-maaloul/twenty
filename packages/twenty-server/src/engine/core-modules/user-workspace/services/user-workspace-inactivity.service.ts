import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { UserSessionRevokedReason } from 'src/engine/core-modules/user-session/types/user-session-revoked-reason.type';
import { UserSessionService } from 'src/engine/core-modules/user-session/services/user-session.service';
import { USER_WORKSPACE_INACTIVITY_PERIOD_IN_MS } from 'src/engine/core-modules/user-workspace/constants/user-workspace-inactivity.constant';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';

@Injectable()
export class UserWorkspaceInactivityService {
  private readonly logger = new Logger(UserWorkspaceInactivityService.name);

  constructor(
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly userSessionService: UserSessionService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
  ) {}

  async suspendInactiveMemberships(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - USER_WORKSPACE_INACTIVITY_PERIOD_IN_MS,
    );
    const { raw } = await this.userWorkspaceRepository
      .createQueryBuilder()
      .update(UserWorkspaceEntity)
      .set({ suspendedAt: now })
      .where('"deletedAt" IS NULL')
      .andWhere('"suspendedAt" IS NULL')
      .andWhere('"lastHumanInteractiveActivityAt" < :cutoff', { cutoff })
      .returning(['id'])
      .execute();

    const suspendedMembershipIds = ((raw ?? []) as Array<{ id: string }>).map(
      ({ id }) => id,
    );

    if (suspendedMembershipIds.length === 0) {
      return 0;
    }

    const cacheInvalidationResults = await Promise.allSettled(
      suspendedMembershipIds.map((id) =>
        this.coreEntityCacheService.invalidate('userWorkspaceEntity', id),
      ),
    );
    const failedCacheInvalidations = cacheInvalidationResults.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (failedCacheInvalidations > 0) {
      this.logger.error(
        `Failed to invalidate ${failedCacheInvalidations} suspended workspace membership cache entries`,
      );
    }

    try {
      await this.userSessionService.revokeAllSessionsForUserWorkspaces({
        userWorkspaceIds: suspendedMembershipIds,
        reason: UserSessionRevokedReason.MembershipSuspended,
      });
    } catch (error) {
      this.logger.error(
        `Failed to revoke sessions for suspended workspace memberships: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return suspendedMembershipIds.length;
  }

  async reactivateMembership(userWorkspaceId: string): Promise<boolean> {
    const { affected } = await this.userWorkspaceRepository
      .createQueryBuilder()
      .update(UserWorkspaceEntity)
      .set({
        suspendedAt: null,
        lastHumanInteractiveActivityAt: new Date(),
      })
      .where('"id" = :userWorkspaceId', { userWorkspaceId })
      .andWhere('"deletedAt" IS NULL')
      .andWhere('"suspendedAt" IS NOT NULL')
      .execute();

    if (affected !== 1) {
      return false;
    }

    try {
      await this.coreEntityCacheService.invalidateAndRecompute(
        'userWorkspaceEntity',
        userWorkspaceId,
      );
    } catch (error) {
      this.logger.error(
        `Workspace membership was reactivated but its cache refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return true;
  }
}
