import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createHash, randomBytes } from 'node:crypto';
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
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

const invalidCapability = () =>
  new AuthException(
    'First-password capability is invalid or expired',
    AuthExceptionCode.FORBIDDEN_EXCEPTION,
  );

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
  now,
}: {
  user: UserEntity | null;
  token: AppTokenEntity | null;
  userId: string;
  capabilityHash: string;
  expectedEpoch: number;
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
  !!user.passwordHash &&
  isFutureDate(token.expiresAt, now) &&
  isFutureDate(user.temporaryPasswordExpiresAt, now);

const hashCapability = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class FirstPasswordCreationService {
  private readonly logger = new Logger(FirstPasswordCreationService.name);

  constructor(
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly authService: AuthService,
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
          context: { credentialEpoch: user.credentialEpoch },
        });

        return capabilityExpiresAt;
      },
    );

    return { capability, expiresAt };
  }

  async createPermanentPassword(
    capability: string | undefined,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
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
        const user = await userRepository.findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        const lockedToken = await appTokenRepository.findOne({
          where: { id: token.id },
          lock: { mode: 'pessimistic_write' },
        });

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
              now: new Date(),
            })
          ) {
            throw invalidCapability();
          }

          throw invalidPasswordInput();
        }

        const reusesTemporaryPassword = await compareHash(
          newPassword,
          user.passwordHash,
        );

        if (
          !isValidCapabilityState({
            user,
            token: lockedToken,
            userId,
            capabilityHash,
            expectedEpoch,
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
  }
}
