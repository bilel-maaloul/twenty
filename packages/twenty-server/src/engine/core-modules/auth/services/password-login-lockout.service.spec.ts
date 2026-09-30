import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';

import { PasswordLoginLockoutService } from './password-login-lockout.service';

describe('PasswordLoginLockoutService', () => {
  const createService = () => {
    const runScript = jest.fn().mockResolvedValue(0);
    const cacheStorageService = {
      runScript,
    } as unknown as CacheStorageService;
    const service = new PasswordLoginLockoutService(cacheStorageService);

    return { service, runScript };
  };

  it('uses atomic Redis scripts to check and record lockout state', async () => {
    const { service, runScript } = createService();
    runScript.mockResolvedValueOnce(1);
    await expect(service.isLocked('Member@Example.com')).resolves.toBe(true);

    await service.recordFailedAttempt('Member@Example.com');

    expect(runScript).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        script: expect.objectContaining({
          name: 'check-password-login-lockout',
          source: expect.stringContaining("redis.call('TIME')"),
        }),
        args: [],
      }),
    );
    expect(runScript).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        script: expect.objectContaining({
          name: 'record-password-login-failure',
          source: expect.stringContaining('HINCRBY'),
        }),
        args: ['3', '900000'],
      }),
    );
    expect(runScript.mock.calls[1][0].script.source).toContain(
      "redis.call('TIME')",
    );
    expect(runScript.mock.calls[1][0].keys[0]).not.toContain(
      'Member@Example.com',
    );
  });

  it('atomically refuses to reset while another request has activated lockout', async () => {
    const { service, runScript } = createService();
    runScript.mockResolvedValueOnce(0);

    await expect(
      service.resetFailedAttempts('member@example.com'),
    ).resolves.toBe(false);

    expect(runScript).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          name: 'reset-password-login-failures',
          source: expect.stringContaining("redis.call('TIME')"),
        }),
        args: [],
      }),
    );
  });

  it('resets the counter after a valid password when no lockout is active', async () => {
    const { service, runScript } = createService();
    runScript.mockResolvedValueOnce(1);

    await expect(
      service.resetFailedAttempts('member@example.com'),
    ).resolves.toBe(true);
  });
});
