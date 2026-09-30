import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createHash, randomBytes, randomInt } from 'node:crypto';
import ms from 'ms';
import { IsNull, Repository } from 'typeorm';

import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import {
  compareHash,
  hashPassword,
  PASSWORD_REGEX,
} from 'src/engine/core-modules/auth/auth.util';
import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { getPermanentPasswordExpiresAt } from 'src/engine/core-modules/auth/constants/permanent-password-lifetime.constant';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

const invalidCapability = () =>
  new AuthException(
    'First-password capability is invalid or expired',
    AuthExceptionCode.FORBIDDEN_EXCEPTION,
  );

const invalidInvitationPasscode = () =>
  new AuthException(
    'Invitation passcode is invalid or expired',
    AuthExceptionCode.FORBIDDEN_EXCEPTION,
  );

const INVITATION_PASSCODE_ATTEMPT_LIMIT = 5;
const INVITATION_PASSCODE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export class FirstPasswordInputRejectedException extends AuthException {
  constructor() {
    super(
      'Password confirmation or policy is invalid',
      AuthExceptionCode.INVALID_INPUT,
    );
  }
}

const invalidPasswordInput = () => new FirstPasswordInputRejectedException();

const firstPasswordCreationFailed = (
  message = 'First-password creation failed',
) => new AuthException(message, AuthExceptionCode.INTERNAL_SERVER_ERROR);

const isFutureDate = (
  value: Date | null | undefined,
  now: Date,
): value is Date =>
  value instanceof Date &&
  Number.isFinite(value.getTime()) &&
  value.getTime() > now.getTime();

const isValidCapabilityState = ({
  user,
  token,
  userId,
  capabilityHash,
  expectedEpoch,
  userWorkspace,
  now,
}: {
  user: UserEntity | null;
  token: AppTokenEntity | null;
  userId: string;
  capabilityHash: string;
  expectedEpoch: number;
  userWorkspace?: UserWorkspaceEntity | null;
  now: Date;
}): boolean =>
  !!user &&
  !!token &&
  token.userId === userId &&
  token.type === AppTokenType.FirstPasswordCreation &&
  token.value === capabilityHash &&
  !token.revokedAt &&
  !token.deletedAt &&
  token.context?.credentialEpoch === expectedEpoch &&
  user.id === userId &&
  user.credentialEpoch === expectedEpoch &&
  !user.disabled &&
  user.mustChangePassword &&
  isFutureDate(token.expiresAt, now) &&
  (token.context?.firstPasswordFlow === 'invitation-passcode'
    ? !!token.workspaceId &&
      !!userWorkspace &&
      userWorkspace.userId === userId &&
      userWorkspace.workspaceId === token.workspaceId &&
      !userWorkspace.suspendedAt &&
      !user.passwordHash &&
      user.temporaryPasswordExpiresAt === null
    : !!user.passwordHash &&
      isFutureDate(user.temporaryPasswordExpiresAt, now));

const hashCapability = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export type DeletedUserInvitationRestoreResult =
  | { status: 'restored' | 'already_active'; user: UserEntity }
  | { status: 'unavailable' };

@Injectable()
export class FirstPasswordCreationService {
  private readonly logger = new Logger(FirstPasswordCreationService.name);
  private readonly dummyPasscodeHash = hashPassword(
    randomBytes(32).toString('hex'),
  );

  constructor(
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly throttlerService: ThrottlerService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly authService: AuthService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
  ) {}

  async issueCapability(
    initiallyValidatedUser: UserEntity,
    temporaryPassword: string,
  ): Promise<{ capability: string; expiresAt: Date }> {
    const capability = randomBytes(32).toString('base64url');
    const capabilityHash = hashCapability(capability);
    const duration = ms(
      this.twentyConfigService.get('FIRST_PASSWORD_CREATION_EXPIRES_IN'),
    );

    if (!Number.isFinite(duration) || duration <= 0) {
      throw invalidCapability();
    }

    const expiresAt = await this.appTokenRepository.manager.transaction(
      async (manager) => {
        const userRepository = manager.getRepository(UserEntity);
        const appTokenRepository = manager.getRepository(AppTokenEntity);
        const user = await userRepository.findOne({
          where: { id: initiallyValidatedUser.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !user ||
          user.disabled ||
          !user.mustChangePassword ||
          !user.passwordHash ||
          user.passwordHash !== initiallyValidatedUser.passwordHash ||
          user.credentialEpoch !== initiallyValidatedUser.credentialEpoch ||
          !Number.isSafeInteger(user.credentialEpoch) ||
          user.credentialEpoch < 0 ||
          !(await compareHash(temporaryPassword, user.passwordHash))
        ) {
          throw invalidCapability();
        }

        const now = new Date();

        if (!isFutureDate(user.temporaryPasswordExpiresAt, now)) {
          throw invalidCapability();
        }

        const capabilityExpiresAt = new Date(
          Math.min(
            now.getTime() + duration,
            user.temporaryPasswordExpiresAt.getTime(),
          ),
        );

        await appTokenRepository.update(
          {
            userId: user.id,
            type: AppTokenType.FirstPasswordCreation,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );
        await appTokenRepository.insert({
          userId: user.id,
          type: AppTokenType.FirstPasswordCreation,
          value: capabilityHash,
          expiresAt: capabilityExpiresAt,
          context: {
            credentialEpoch: user.credentialEpoch,
            firstPasswordFlow: 'temporary-password',
          },
        });

        return capabilityExpiresAt;
      },
    );

    return { capability, expiresAt };
  }

  async restoreDeletedUserForInvitation({
    userId,
    firstName,
    lastName,
  }: {
    userId: string;
    firstName: string;
    lastName: string;
  }): Promise<DeletedUserInvitationRestoreResult> {
    const result = await this.appTokenRepository.manager.transaction(
      async (manager): Promise<DeletedUserInvitationRestoreResult> => {
        const userRepository = manager.getRepository(UserEntity);
        const userWorkspaceRepository =
          manager.getRepository(UserWorkspaceEntity);
        const appTokenRepository = manager.getRepository(AppTokenEntity);
        const user = await userRepository.findOne({
          where: { id: userId },
          withDeleted: true,
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          return { status: 'unavailable' };
        }

        if (!user.deletedAt) {
          return { status: 'already_active', user };
        }

        if (
          user.disabled ||
          user.canAccessFullAdminPanel ||
          user.canImpersonate ||
          !Number.isSafeInteger(user.credentialEpoch) ||
          user.credentialEpoch < 0 ||
          user.credentialEpoch >= Number.MAX_SAFE_INTEGER
        ) {
          return { status: 'unavailable' };
        }

        const activeMemberships = await userWorkspaceRepository.find({
          where: { userId },
          lock: { mode: 'pessimistic_write' },
        });

        if (activeMemberships.length > 0) {
          return { status: 'unavailable' };
        }

        const now = new Date();

        await userRepository.restore({ id: userId });

        const update = await userRepository.update(
          { id: userId },
          {
            firstName,
            lastName,
            passwordHash: null,
            mustChangePassword: true,
            temporaryPasswordExpiresAt: null,
            permanentPasswordExpiresAt: null,
            credentialEpoch: () => '"credentialEpoch" + 1',
          },
        );

        if (update.affected !== 1) {
          throw new Error('Restored identity state could not be updated');
        }

        await appTokenRepository.update(
          { userId, revokedAt: IsNull() },
          { revokedAt: now, expiresAt: now },
        );

        const restoredUser = await userRepository.findOne({
          where: { id: userId },
        });

        if (!restoredUser) {
          throw new Error('Restored identity could not be reloaded');
        }

        return { status: 'restored', user: restoredUser };
      },
    );

    if (result.status === 'restored') {
      await this.authService.invalidateCredentialsAfterPasswordChange(userId);
    }

    return result;
  }

  async issueInvitationPasscode({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }): Promise<{ passcode: string; expiresAt: Date }> {
    const duration = ms(
      this.twentyConfigService.get('FIRST_PASSWORD_CREATION_EXPIRES_IN'),
    );

    if (!Number.isFinite(duration) || duration <= 0) {
      throw invalidInvitationPasscode();
    }

    const passcode = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const passcodeHash = await hashPassword(passcode);
    const expiresAt = new Date(Date.now() + duration);

    await this.appTokenRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const userWorkspaceRepository =
        manager.getRepository(UserWorkspaceEntity);
      const appTokenRepository = manager.getRepository(AppTokenEntity);
      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      const userWorkspace = await userWorkspaceRepository.findOne({
        where: { userId, workspaceId, suspendedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !user ||
        user.disabled ||
        !user.mustChangePassword ||
        user.passwordHash ||
        user.temporaryPasswordExpiresAt ||
        !Number.isSafeInteger(user.credentialEpoch) ||
        user.credentialEpoch < 0 ||
        !userWorkspace
      ) {
        throw invalidInvitationPasscode();
      }

      const now = new Date();

      await appTokenRepository.update(
        {
          userId,
          type: AppTokenType.FirstPasswordInvitationPasscode,
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );
      await appTokenRepository.update(
        {
          userId,
          type: AppTokenType.FirstPasswordCreation,
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );
      await appTokenRepository.insert({
        userId,
        workspaceId,
        type: AppTokenType.FirstPasswordInvitationPasscode,
        value: passcodeHash,
        expiresAt,
        context: {
          email: user.email,
          credentialEpoch: user.credentialEpoch,
        },
      });
    });

    return { passcode, expiresAt };
  }

  async verifyInvitationPasscode({
    email,
    workspaceId,
    passcode,
    ipAddress,
  }: {
    email: string;
    workspaceId: string;
    passcode: string;
    ipAddress: string;
  }): Promise<{ capability: string; expiresAt: Date }> {
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = createHash('sha256')
      .update(normalizedEmail)
      .digest('hex');

    await Promise.all([
      this.throttlerService.tokenBucketThrottleOrThrow(
        `first-password-invitation:email:${emailHash}:${workspaceId}`,
        1,
        INVITATION_PASSCODE_ATTEMPT_LIMIT,
        INVITATION_PASSCODE_ATTEMPT_WINDOW_MS,
      ),
      this.throttlerService.tokenBucketThrottleOrThrow(
        `first-password-invitation:ip:${ipAddress}`,
        1,
        INVITATION_PASSCODE_ATTEMPT_LIMIT * 4,
        INVITATION_PASSCODE_ATTEMPT_WINDOW_MS,
      ),
    ]);

    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await compareHash(passcode, await this.dummyPasscodeHash);
      throw invalidInvitationPasscode();
    }

    await this.throttlerService.tokenBucketThrottleOrThrow(
      `first-password-invitation:user:${user.id}:${workspaceId}`,
      1,
      INVITATION_PASSCODE_ATTEMPT_LIMIT,
      INVITATION_PASSCODE_ATTEMPT_WINDOW_MS,
    );

    const candidate = await this.appTokenRepository.findOne({
      where: {
        userId: user.id,
        workspaceId,
        type: AppTokenType.FirstPasswordInvitationPasscode,
        revokedAt: IsNull(),
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!candidate) {
      await compareHash(passcode, await this.dummyPasscodeHash);
      throw invalidInvitationPasscode();
    }

    if (!/^\d{6}$/.test(passcode)) {
      await compareHash(passcode, candidate.value);
      throw invalidInvitationPasscode();
    }

    const capability = randomBytes(32).toString('base64url');
    const capabilityHash = hashCapability(capability);
    const duration = ms(
      this.twentyConfigService.get('FIRST_PASSWORD_CREATION_EXPIRES_IN'),
    );
    let expiresAt: Date | undefined;
    let isValidPasscode = false;

    if (!Number.isFinite(duration) || duration <= 0) {
      throw invalidInvitationPasscode();
    }

    await this.appTokenRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const userWorkspaceRepository =
        manager.getRepository(UserWorkspaceEntity);
      const appTokenRepository = manager.getRepository(AppTokenEntity);
      const lockedUser = await userRepository.findOne({
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      const lockedToken = await appTokenRepository.findOne({
        where: {
          id: candidate.id,
          userId: user.id,
          workspaceId,
          type: AppTokenType.FirstPasswordInvitationPasscode,
          revokedAt: IsNull(),
          deletedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const userWorkspace = await userWorkspaceRepository.findOne({
        where: { userId: user.id, workspaceId, suspendedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();

      isValidPasscode =
        !!lockedUser &&
        !!lockedToken &&
        !!userWorkspace &&
        !lockedUser.disabled &&
        lockedUser.mustChangePassword &&
        !lockedUser.passwordHash &&
        lockedUser.temporaryPasswordExpiresAt === null &&
        lockedUser.credentialEpoch === lockedToken.context?.credentialEpoch &&
        lockedToken.context?.email === normalizedEmail &&
        isFutureDate(lockedToken.expiresAt, now) &&
        (await compareHash(passcode, lockedToken.value));

      if (!isValidPasscode || !lockedUser || !lockedToken) {
        return;
      }

      expiresAt = new Date(
        Math.min(now.getTime() + duration, lockedToken.expiresAt.getTime()),
      );

      await appTokenRepository.update(
        {
          id: lockedToken.id,
          type: AppTokenType.FirstPasswordInvitationPasscode,
        },
        { revokedAt: now },
      );
      await appTokenRepository.update(
        {
          userId: lockedUser.id,
          type: AppTokenType.FirstPasswordCreation,
          revokedAt: IsNull(),
        },
        { revokedAt: now },
      );
      await appTokenRepository.insert({
        userId: lockedUser.id,
        workspaceId,
        type: AppTokenType.FirstPasswordCreation,
        value: capabilityHash,
        expiresAt,
        context: {
          credentialEpoch: lockedUser.credentialEpoch,
          firstPasswordFlow: 'invitation-passcode',
        },
      });
      await userRepository.update(
        { id: lockedUser.id, credentialEpoch: lockedUser.credentialEpoch },
        { isEmailVerified: true },
      );
    });

    if (!isValidPasscode || !expiresAt) {
      await compareHash(passcode, await this.dummyPasscodeHash);
      throw invalidInvitationPasscode();
    }

    await this.coreEntityCacheService.invalidate('user', user.id);

    return { capability, expiresAt };
  }

  async hasValidCapability(capability: string | undefined): Promise<boolean> {
    if (!capability) {
      return false;
    }

    try {
      const token = await this.appTokenRepository.findOne({
        where: {
          value: hashCapability(capability),
          type: AppTokenType.FirstPasswordCreation,
          revokedAt: IsNull(),
          deletedAt: IsNull(),
        },
      });

      if (!token?.userId) {
        return false;
      }

      const expectedEpoch = token.context?.credentialEpoch;

      if (typeof expectedEpoch !== 'number') {
        return false;
      }

      const user = await this.userRepository.findOneBy({ id: token.userId });
      const userWorkspace =
        token.context?.firstPasswordFlow === 'invitation-passcode' &&
        token.workspaceId
          ? await this.userRepository.manager
              .getRepository(UserWorkspaceEntity)
              .findOne({
                where: {
                  userId: token.userId,
                  workspaceId: token.workspaceId,
                  suspendedAt: IsNull(),
                },
              })
          : undefined;

      return isValidCapabilityState({
        user,
        token,
        userId: token.userId,
        capabilityHash: hashCapability(capability),
        expectedEpoch,
        userWorkspace,
        now: new Date(),
      });
    } catch {
      return false;
    }
  }

  async createPermanentPassword(
    capability: string | undefined,
    newPassword: string,
    confirmPassword: string,
  ): Promise<{ userId: string; credentialEpoch: number }> {
    if (!capability) {
      throw invalidCapability();
    }

    const capabilityHash = hashCapability(capability);
    let token: AppTokenEntity | null;

    try {
      token = await this.appTokenRepository.findOne({
        where: {
          value: capabilityHash,
          type: AppTokenType.FirstPasswordCreation,
        },
      });
    } catch {
      throw firstPasswordCreationFailed();
    }

    if (!token?.userId) {
      throw invalidCapability();
    }

    const userId = token.userId;
    const expectedEpoch = token.context?.credentialEpoch;

    if (
      typeof expectedEpoch !== 'number' ||
      !Number.isSafeInteger(expectedEpoch) ||
      expectedEpoch < 0
    ) {
      throw invalidCapability();
    }

    let committed = false;
    let passwordUpdateAttempted = false;
    let newPasswordHash: string | undefined;

    try {
      await this.appTokenRepository.manager.transaction(async (manager) => {
        const userRepository = manager.getRepository(UserEntity);
        const appTokenRepository = manager.getRepository(AppTokenEntity);
        const userWorkspaceRepository =
          manager.getRepository(UserWorkspaceEntity);
        const user = await userRepository.findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        const lockedToken = await appTokenRepository.findOne({
          where: { id: token.id },
          lock: { mode: 'pessimistic_write' },
        });
        const userWorkspace =
          lockedToken?.context?.firstPasswordFlow === 'invitation-passcode' &&
          lockedToken.workspaceId
            ? await userWorkspaceRepository.findOne({
                where: {
                  userId,
                  workspaceId: lockedToken.workspaceId,
                  suspendedAt: IsNull(),
                },
                lock: { mode: 'pessimistic_write' },
              })
            : undefined;

        const now = new Date();

        if (
          !user ||
          !lockedToken ||
          !isValidCapabilityState({
            user,
            token: lockedToken,
            userId,
            capabilityHash,
            expectedEpoch,
            userWorkspace,
            now,
          })
        ) {
          throw invalidCapability();
        }

        if (
          newPassword !== confirmPassword ||
          !PASSWORD_REGEX.test(newPassword)
        ) {
          if (
            !isValidCapabilityState({
              user,
              token: lockedToken,
              userId,
              capabilityHash,
              expectedEpoch,
              userWorkspace,
              now: new Date(),
            })
          ) {
            throw invalidCapability();
          }

          throw invalidPasswordInput();
        }

        const reusesTemporaryPassword =
          !!user.passwordHash &&
          (await compareHash(newPassword, user.passwordHash));

        if (
          !isValidCapabilityState({
            user,
            token: lockedToken,
            userId,
            capabilityHash,
            expectedEpoch,
            userWorkspace,
            now: new Date(),
          })
        ) {
          throw invalidCapability();
        }

        if (reusesTemporaryPassword) {
          throw invalidPasswordInput();
        }

        const passwordHash = await hashPassword(newPassword);

        newPasswordHash = passwordHash;

        if (
          !isValidCapabilityState({
            user,
            token: lockedToken,
            userId,
            capabilityHash,
            expectedEpoch,
            userWorkspace,
            now: new Date(),
          })
        ) {
          throw invalidCapability();
        }

        passwordUpdateAttempted = true;

        const update = await userRepository.update(
          {
            id: user.id,
            credentialEpoch: expectedEpoch,
            mustChangePassword: true,
            disabled: false,
          },
          {
            passwordHash,
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
            permanentPasswordExpiresAt: getPermanentPasswordExpiresAt(now),
            credentialEpoch: () => '"credentialEpoch" + 1',
          },
        );

        if (update.affected !== 1) {
          throw invalidCapability();
        }

        await appTokenRepository.update(
          {
            userId: user.id,
            type: AppTokenType.FirstPasswordCreation,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );
        await appTokenRepository.update(
          {
            userId: user.id,
            type: AppTokenType.FirstPasswordInvitationPasscode,
            revokedAt: IsNull(),
          },
          { revokedAt: now },
        );
      });
      committed = true;
    } catch (error) {
      if (error instanceof AuthException) {
        throw error;
      }

      if (!passwordUpdateAttempted || !newPasswordHash) {
        throw firstPasswordCreationFailed();
      }

      // A lost commit acknowledgement must not be reported as a safe failure.
      try {
        const [authoritativeUser, authoritativeToken] = await Promise.all([
          this.userRepository.findOneBy({ id: userId }),
          this.appTokenRepository.findOneBy({ id: token.id }),
        ]);

        if (
          authoritativeUser?.passwordHash === newPasswordHash &&
          authoritativeUser.mustChangePassword === false &&
          authoritativeUser.temporaryPasswordExpiresAt === null &&
          authoritativeUser.permanentPasswordExpiresAt instanceof Date &&
          authoritativeUser.permanentPasswordExpiresAt.getTime() > Date.now() &&
          authoritativeUser.credentialEpoch === expectedEpoch + 1 &&
          authoritativeToken?.revokedAt
        ) {
          committed = true;
        } else if (
          !isValidCapabilityState({
            user: authoritativeUser,
            token: authoritativeToken,
            userId,
            capabilityHash,
            expectedEpoch,
            now: new Date(),
          })
        ) {
          throw invalidCapability();
        } else {
          throw firstPasswordCreationFailed(
            'First-password creation outcome is unknown',
          );
        }
      } catch (reconciliationError) {
        if (reconciliationError instanceof AuthException) {
          throw reconciliationError;
        }

        this.logger.error('First-password creation outcome is unknown');
        throw firstPasswordCreationFailed(
          'First-password creation outcome is unknown',
        );
      }
    }

    if (committed) {
      try {
        await this.authService.invalidateCredentialsAfterPasswordChange(userId);
      } catch {
        this.logger.error(
          'First password created, but credential cleanup failed',
        );
      }
    }

    return { userId, credentialEpoch: expectedEpoch + 1 };
  }
}
