import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { randomInt } from 'node:crypto';
import { addMilliseconds } from 'date-fns';
import { type SendMailOptions } from 'nodemailer';
import { IsNull, Repository } from 'typeorm';
import { SOURCE_LOCALE } from 'twenty-shared/translations';

import { InteractiveLoginOtpEmail, renderEmail } from 'twenty-emails';
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
} from 'src/engine/core-modules/auth/auth.util';
import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { type CacheScript } from 'src/engine/core-modules/cache-storage/types/cache-script.type';
import { EmailSenderService } from 'src/engine/core-modules/email/email-sender.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { assertUserCredentialIsValid } from 'src/engine/core-modules/auth/utils/assert-user-credential-is-valid.util';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

const OTP_LENGTH = 6;
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_SEND_LIMIT = 3;
const OTP_ATTEMPT_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const CLAIM_SEND_SCRIPT: CacheScript = {
  name: 'claim-interactive-email-otp-send',
  source: `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  return 0
end
count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return 1`,
};

const CHECK_ATTEMPTS_SCRIPT: CacheScript = {
  name: 'check-interactive-email-otp-attempts',
  source: `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  return 0
end
return 1`,
};

const RECORD_FAILED_ATTEMPT_SCRIPT: CacheScript = {
  name: 'record-interactive-email-otp-attempt',
  source: `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  return count
end
count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return count`,
};

const getInvalidOtpException = () =>
  new AuthException(
    'The sign-in code is invalid or expired',
    AuthExceptionCode.INVALID_LOGIN_OTP,
  );

export type InteractiveEmailOtpFlow = 'login-token' | 'workspace-agnostic';

type IssueEmailOtpParams = {
  userId: string;
  authProvider: AuthProviderEnum;
  flow: InteractiveEmailOtpFlow;
  workspaceId?: string;
};

export type ConsumedInteractiveEmailOtp = {
  user: UserEntity;
  authProvider: AuthProviderEnum;
  flow: InteractiveEmailOtpFlow;
  workspaceId: string | null;
  credentialEpoch: number;
};

@Injectable()
export class EmailLoginOtpService {
  private readonly logger = new Logger(EmailLoginOtpService.name);

  constructor(
    @InjectRepository(AppTokenEntity)
    private readonly appTokenRepository: Repository<AppTokenEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly emailSenderService: EmailSenderService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectCacheStorage(CacheStorageNamespace.EngineAuthSession)
    private readonly cacheStorageService: CacheStorageService,
  ) {}

  async issueChallenge({
    userId,
    authProvider,
    flow,
    workspaceId,
  }: IssueEmailOtpParams): Promise<string> {
    await this.preflightDelivery();
    await this.claimSend(userId);

    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user) {
      throw getInvalidOtpException();
    }

    assertUserCredentialIsValid(user, user.credentialEpoch);

    let code: string | undefined = this.generateCode();
    const codeHash = await hashPassword(code);
    const expiresAt = addMilliseconds(new Date(), OTP_LIFETIME_MS);
    let challengeId: string;
    let recipient: { email: string; locale: UserEntity['locale'] };

    try {
      const issuedChallenge = await this.appTokenRepository.manager.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(UserEntity);
          const appTokenRepository = manager.getRepository(AppTokenEntity);
          const lockedUser = await userRepository.findOne({
            where: { id: userId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!lockedUser) {
            throw getInvalidOtpException();
          }

          assertUserCredentialIsValid(lockedUser, lockedUser.credentialEpoch);

          const now = new Date();

          await appTokenRepository.update(
            {
              userId,
              type: AppTokenType.EmailLoginOtp,
              revokedAt: IsNull(),
              deletedAt: IsNull(),
            },
            { revokedAt: now },
          );

          const token = await appTokenRepository.save(
            appTokenRepository.create({
              userId,
              workspaceId: workspaceId ?? null,
              type: AppTokenType.EmailLoginOtp,
              value: codeHash,
              expiresAt,
              context: {
                authProvider,
                credentialEpoch: lockedUser.credentialEpoch,
                emailOtpFlow: flow,
                emailOtpResendCount: 0,
              },
            }),
          );

          return {
            challengeId: token.id,
            email: lockedUser.email,
            locale: lockedUser.locale,
          };
        },
      );

      challengeId = issuedChallenge.challengeId;
      recipient = {
        email: issuedChallenge.email,
        locale: issuedChallenge.locale,
      };
    } catch {
      code = undefined;
      throw new AuthException(
        'Unable to start interactive sign-in verification',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      await this.sendCode(recipient, code);
    } catch {
      this.logger.error(
        'Interactive sign-in OTP delivery failed or is unknown',
      );
      try {
        await this.appTokenRepository.update(
          { id: challengeId, type: AppTokenType.EmailLoginOtp },
          { revokedAt: new Date() },
        );
      } catch {
        this.logger.error('Interactive sign-in OTP invalidation failed');
      }

      throw new AuthException(
        'Unable to deliver interactive sign-in verification',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    } finally {
      code = undefined;
    }

    return challengeId;
  }

  async resendChallenge(challengeId: string): Promise<void> {
    await this.preflightDelivery();

    const existingToken = await this.appTokenRepository.findOneBy({
      id: challengeId,
      type: AppTokenType.EmailLoginOtp,
    });

    if (!existingToken?.userId) {
      throw getInvalidOtpException();
    }

    await this.claimSend(existingToken.userId);

    let code: string | undefined = this.generateCode();
    const codeHash = await hashPassword(code);
    const now = new Date();
    const expiresAt = addMilliseconds(now, OTP_LIFETIME_MS);
    let recipient: { email: string; locale: UserEntity['locale'] };

    try {
      recipient = await this.appTokenRepository.manager.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(UserEntity);
          const appTokenRepository = manager.getRepository(AppTokenEntity);
          const user = await userRepository.findOne({
            where: { id: existingToken.userId },
            lock: { mode: 'pessimistic_write' },
          });
          const token = await appTokenRepository.findOne({
            where: {
              id: challengeId,
              type: AppTokenType.EmailLoginOtp,
              userId: existingToken.userId,
            },
            lock: { mode: 'pessimistic_write' },
          });

          if (
            !user ||
            !token ||
            !this.isChallengeCurrent(token, user, now, false)
          ) {
            throw getInvalidOtpException();
          }

          const resendCount = token.context?.emailOtpResendCount ?? 0;

          await appTokenRepository.update(
            { id: token.id, type: AppTokenType.EmailLoginOtp },
            {
              value: codeHash,
              expiresAt,
              context: {
                ...token.context,
                emailOtpResendCount: resendCount + 1,
              },
            },
          );

          return { email: user.email, locale: user.locale };
        },
      );
    } catch (error) {
      code = undefined;

      if (error instanceof AuthException) {
        throw error;
      }

      throw new AuthException(
        'Unable to resend interactive sign-in verification',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      await this.sendCode(recipient, code);
    } catch {
      this.logger.error(
        'Interactive sign-in OTP delivery failed or is unknown',
      );
      throw new AuthException(
        'Unable to deliver interactive sign-in verification',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    } finally {
      code = undefined;
    }
  }

  async consumeChallenge(
    challengeId: string,
    submittedCode: string,
  ): Promise<ConsumedInteractiveEmailOtp> {
    const token = await this.appTokenRepository.findOneBy({
      id: challengeId,
      type: AppTokenType.EmailLoginOtp,
    });

    if (!token?.userId) {
      throw getInvalidOtpException();
    }

    let consumed: ConsumedInteractiveEmailOtp | null = null;
    let codeIsValid = false;

    try {
      await this.appTokenRepository.manager.transaction(async (manager) => {
        const userRepository = manager.getRepository(UserEntity);
        const appTokenRepository = manager.getRepository(AppTokenEntity);
        const user = await userRepository.findOne({
          where: { id: token.userId },
          lock: { mode: 'pessimistic_write' },
        });
        const lockedToken = await appTokenRepository.findOne({
          where: {
            id: challengeId,
            type: AppTokenType.EmailLoginOtp,
            userId: token.userId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        const now = new Date();

        if (
          !user ||
          !lockedToken ||
          !this.isChallengeCurrent(lockedToken, user, now, true)
        ) {
          throw getInvalidOtpException();
        }

        const mayAttempt = await this.checkMayAttempt(user.id);

        if (!mayAttempt) {
          throw getInvalidOtpException();
        }

        codeIsValid = await compareHash(submittedCode, lockedToken.value);

        if (!codeIsValid) {
          await this.recordFailedAttempt(user.id);

          return;
        }

        const authProvider = lockedToken.context?.authProvider;
        const flow = lockedToken.context?.emailOtpFlow;

        if (
          !authProvider ||
          !Object.values(AuthProviderEnum).includes(authProvider) ||
          (flow !== 'login-token' && flow !== 'workspace-agnostic')
        ) {
          throw getInvalidOtpException();
        }

        assertUserCredentialIsValid(user, lockedToken.context?.credentialEpoch);

        await appTokenRepository.update(
          { id: lockedToken.id, type: AppTokenType.EmailLoginOtp },
          { revokedAt: now },
        );

        consumed = {
          user,
          authProvider,
          flow,
          workspaceId: lockedToken.workspaceId,
          credentialEpoch: user.credentialEpoch,
        };
      });
    } catch (error) {
      if (error instanceof AuthException) {
        throw error;
      }

      throw new AuthException(
        'Unable to verify interactive sign-in',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    }

    if (!codeIsValid || !consumed) {
      throw getInvalidOtpException();
    }

    try {
      await this.cacheStorageService.del(this.getAttemptKey(token.userId));
    } catch {
      this.logger.warn('Interactive sign-in OTP rate state cleanup failed');
    }

    return consumed;
  }

  private isChallengeCurrent(
    token: AppTokenEntity,
    user: UserEntity,
    now: Date,
    requireUnexpired: boolean,
  ): boolean {
    const credentialEpoch = token.context?.credentialEpoch;

    return (
      token.type === AppTokenType.EmailLoginOtp &&
      token.userId === user.id &&
      token.revokedAt === null &&
      token.deletedAt === null &&
      (!requireUnexpired || token.expiresAt.getTime() > now.getTime()) &&
      typeof credentialEpoch === 'number' &&
      Number.isSafeInteger(credentialEpoch) &&
      credentialEpoch === user.credentialEpoch &&
      !user.disabled &&
      !user.mustChangePassword
    );
  }

  private async claimSend(userId: string): Promise<void> {
    const isAllowed = await this.cacheStorageService.runScript<number>({
      script: CLAIM_SEND_SCRIPT,
      keys: [this.getSendKey(userId)],
      args: [OTP_SEND_LIMIT.toString(), RATE_WINDOW_MS.toString()],
    });

    if (isAllowed !== 1) {
      throw getInvalidOtpException();
    }
  }

  private async checkMayAttempt(userId: string): Promise<boolean> {
    const mayAttempt = await this.cacheStorageService.runScript<number>({
      script: CHECK_ATTEMPTS_SCRIPT,
      keys: [this.getAttemptKey(userId)],
      args: [OTP_ATTEMPT_LIMIT.toString()],
    });

    return mayAttempt === 1;
  }

  private async recordFailedAttempt(userId: string): Promise<void> {
    await this.cacheStorageService.runScript<number>({
      script: RECORD_FAILED_ATTEMPT_SCRIPT,
      keys: [this.getAttemptKey(userId)],
      args: [OTP_ATTEMPT_LIMIT.toString(), RATE_WINDOW_MS.toString()],
    });
  }

  private async preflightDelivery(): Promise<void> {
    try {
      await this.emailSenderService.verifySensitiveDelivery();
    } catch {
      this.logger.error('Interactive sign-in OTP SMTP preflight failed');
      throw new AuthException(
        'Interactive sign-in verification is unavailable',
        AuthExceptionCode.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async sendCode(
    recipient: { email: string; locale: UserEntity['locale'] },
    code: string | undefined,
  ): Promise<void> {
    if (!code) {
      throw new Error('Interactive sign-in code is unavailable');
    }

    const emailTemplate = InteractiveLoginOtpEmail({
      code,
      locale: recipient.locale ?? SOURCE_LOCALE,
    });
    const html = await renderEmail(emailTemplate, { pretty: true });
    const text = await renderEmail(emailTemplate, { plainText: true });
    const sendMailOptions: SendMailOptions = {
      from: `${this.twentyConfigService.get('EMAIL_FROM_NAME')} <${this.twentyConfigService.get('EMAIL_FROM_ADDRESS')}>`,
      to: recipient.email,
      subject: 'Your Twenty sign-in code',
      html,
      text,
    };

    await this.emailSenderService.sendSensitive(sendMailOptions);
  }

  private generateCode(): string {
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }

  private getSendKey(userId: string): string {
    return `interactive-email-otp-send:${userId}`;
  }

  private getAttemptKey(userId: string): string {
    return `interactive-email-otp-attempt:${userId}`;
  }
}
