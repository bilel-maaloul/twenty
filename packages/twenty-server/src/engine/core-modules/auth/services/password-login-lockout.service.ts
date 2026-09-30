import { Injectable, Logger } from '@nestjs/common';

import { createHash } from 'node:crypto';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { type CacheScript } from 'src/engine/core-modules/cache-storage/types/cache-script.type';

const FAILED_ATTEMPT_LIMIT = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const IS_LOCKED_SCRIPT: CacheScript = {
  name: 'check-password-login-lockout',
  source: `
local lockedUntil = tonumber(redis.call('HGET', KEYS[1], 'lockedUntil') or '0')
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)

if lockedUntil > now then
  return 1
end

if lockedUntil > 0 then
  redis.call('DEL', KEYS[1])
  return 2
end

return 0`,
};

const RECORD_FAILED_ATTEMPT_SCRIPT: CacheScript = {
  name: 'record-password-login-failure',
  source: `
local lockedUntil = tonumber(redis.call('HGET', KEYS[1], 'lockedUntil') or '0')
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)

if lockedUntil > now then
  return 0
end

if lockedUntil > 0 then
  redis.call('DEL', KEYS[1])
end

local attempts = redis.call('HINCRBY', KEYS[1], 'failedAttempts', 1)
local lockoutDuration = tonumber(ARGV[2])

if attempts >= tonumber(ARGV[1]) then
  redis.call('HSET', KEYS[1], 'lockedUntil', now + lockoutDuration)
  redis.call('PEXPIRE', KEYS[1], lockoutDuration * 2)
  return 1
end

redis.call('PEXPIRE', KEYS[1], lockoutDuration)
return 0`,
};

const RESET_FAILED_ATTEMPTS_SCRIPT: CacheScript = {
  name: 'reset-password-login-failures',
  source: `
local lockedUntil = tonumber(redis.call('HGET', KEYS[1], 'lockedUntil') or '0')
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)

if lockedUntil > now then
  return 0
end

redis.call('DEL', KEYS[1])
return 1`,
};

@Injectable()
export class PasswordLoginLockoutService {
  private readonly logger = new Logger(PasswordLoginLockoutService.name);

  constructor(
    @InjectCacheStorage(CacheStorageNamespace.EngineAuthSession)
    private readonly cacheStorageService: CacheStorageService,
  ) {}

  async isLocked(email: string): Promise<boolean> {
    const isLocked = await this.cacheStorageService.runScript<number>({
      script: IS_LOCKED_SCRIPT,
      keys: [this.getStateKey(email)],
      args: [],
    });

    if (isLocked === 2) {
      this.logger.log('Interactive password login lockout expired');
    }

    return isLocked === 1;
  }

  async recordFailedAttempt(email: string): Promise<void> {
    const isNewlyLocked = await this.cacheStorageService.runScript<number>({
      script: RECORD_FAILED_ATTEMPT_SCRIPT,
      keys: [this.getStateKey(email)],
      args: [FAILED_ATTEMPT_LIMIT.toString(), LOCKOUT_DURATION_MS.toString()],
    });

    if (isNewlyLocked === 1) {
      this.logger.warn('Interactive password login lockout activated');
    }
  }

  async resetFailedAttempts(email: string): Promise<boolean> {
    const reset = await this.cacheStorageService.runScript<number>({
      script: RESET_FAILED_ATTEMPTS_SCRIPT,
      keys: [this.getStateKey(email)],
      args: [],
    });

    return reset === 1;
  }

  private getStateKey(email: string): string {
    const normalizedEmail = email.toLowerCase();
    const emailDigest = createHash('sha256')
      .update(normalizedEmail)
      .digest('hex');

    return `interactive-password-login:${emailDigest}`;
  }
}
