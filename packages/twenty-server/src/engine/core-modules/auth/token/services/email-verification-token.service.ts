import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import crypto from 'crypto';

import { isDefined } from 'twenty-shared/utils';
import { addMilliseconds } from 'date-fns';
import ms from 'ms';
import { IsNull, MoreThan, Repository } from 'typeorm';

import {
  AppTokenEntity,
  AppTokenType,
} from 'src/engine/core-modules/app-token/app-token.entity';
import { type AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';
import {
  EmailVerificationException,
  EmailVerificationExceptionCode,
} from 'src/engine/core-modules/email-verification/email-verification.exception';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

@Injectable()
export class EmailVerificationTokenService {
  constructor(
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async generateToken(userId: string, email: string): Promise<AuthToken> {
    const expiresIn = this.twentyConfigService.get(
      'EMAIL_VERIFICATION_TOKEN_EXPIRES_IN',
    );
    const expiresAt = addMilliseconds(new Date().getTime(), ms(expiresIn));

    const plainToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(plainToken)
      .digest('hex');

    await this.appTokenRepository.manager.transaction(async (entityManager) => {
      const user = await entityManager.getRepository(UserEntity).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new EmailVerificationException(
          'User not found',
          EmailVerificationExceptionCode.INVALID_TOKEN,
        );
      }

      const appTokenRepository = entityManager.getRepository(AppTokenEntity);

      await appTokenRepository.update(
        {
          userId,
          type: AppTokenType.EmailVerificationToken,
          revokedAt: IsNull(),
        },
        { revokedAt: new Date() },
      );

      await appTokenRepository.save({
        userId,
        expiresAt,
        type: AppTokenType.EmailVerificationToken,
        value: hashedToken,
        context: { email },
      });
    });

    return {
      token: plainToken,
      expiresAt,
    };
  }

  async consumeEmailVerificationTokenOrThrow({
    emailVerificationToken,
    email,
  }: {
    emailVerificationToken: string;
    email: string;
  }) {
    const user = await this.userRepository.findOne({
      where: {
        email,
        isEmailVerified: true,
      },
    });

    if (isDefined(user)) {
      throw new EmailVerificationException(
        'Email already verified',
        EmailVerificationExceptionCode.EMAIL_ALREADY_VERIFIED,
      );
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(emailVerificationToken)
      .digest('hex');

    const now = new Date();
    const appToken = await this.appTokenRepository.findOne({
      where: {
        value: hashedToken,
        type: AppTokenType.EmailVerificationToken,
        revokedAt: IsNull(),
        deletedAt: IsNull(),
      },
      relations: ['user'],
    });

    if (!appToken) {
      throw new EmailVerificationException(
        'Invalid email verification token',
        EmailVerificationExceptionCode.INVALID_TOKEN,
      );
    }

    if (appToken.user.mustChangePassword) {
      throw new EmailVerificationException(
        'First password creation is required before email verification',
        EmailVerificationExceptionCode.INVALID_TOKEN,
      );
    }

    if (appToken.type !== AppTokenType.EmailVerificationToken) {
      throw new EmailVerificationException(
        'Invalid email verification token type',
        EmailVerificationExceptionCode.INVALID_APP_TOKEN_TYPE,
      );
    }

    if (appToken.expiresAt <= now) {
      throw new EmailVerificationException(
        'Email verification token expired',
        EmailVerificationExceptionCode.TOKEN_EXPIRED,
      );
    }

    if (!appToken.context?.email) {
      throw new EmailVerificationException(
        'Email missing in email verification token context',
        EmailVerificationExceptionCode.EMAIL_MISSING,
      );
    }

    if (appToken.context?.email !== email) {
      throw new EmailVerificationException(
        'Email does not match token',
        EmailVerificationExceptionCode.INVALID_EMAIL,
      );
    }

    const consumeResult = await this.appTokenRepository.update(
      {
        id: appToken.id,
        type: AppTokenType.EmailVerificationToken,
        expiresAt: MoreThan(now),
        revokedAt: IsNull(),
        deletedAt: IsNull(),
      },
      { revokedAt: now },
    );

    if (consumeResult.affected !== 1) {
      throw new EmailVerificationException(
        'Invalid email verification token',
        EmailVerificationExceptionCode.INVALID_TOKEN,
      );
    }

    return appToken;
  }
}
