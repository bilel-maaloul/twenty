import { type Request, type Response } from 'express';

import {
  FIRST_PASSWORD_COOKIE_NAME,
  FIRST_PASSWORD_SECURE_COOKIE_NAME,
  FirstPasswordCookieService,
} from 'src/engine/core-modules/auth/services/first-password-cookie.service';

describe('FirstPasswordCookieService', () => {
  const capability = 'a'.repeat(43);

  const createService = (secure: boolean) => {
    const config: Record<string, string> = {
      SERVER_URL: secure ? 'https://crm.example.com' : 'http://localhost:3000',
      FRONTEND_URL: secure
        ? 'https://front.example.com'
        : 'http://localhost:3001',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_ALLOWED_ORIGINS: '',
      NODE_ENV: 'test',
    };

    return Object.assign(Object.create(FirstPasswordCookieService.prototype), {
      twentyConfigService: { get: (key: string) => config[key] },
    }) as FirstPasswordCookieService;
  };

  it('sets and clears the secure HttpOnly host cookie with matching options', () => {
    const service = createService(true);
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const expiresAt = new Date(Date.now() + 60_000);

    service.attachCapability(response, capability, expiresAt);
    service.clearCapability(response);

    expect(response.cookie).toHaveBeenCalledWith(
      FIRST_PASSWORD_SECURE_COOKIE_NAME,
      capability,
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      },
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      FIRST_PASSWORD_SECURE_COOKIE_NAME,
      expect.objectContaining({ secure: true, path: '/' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      FIRST_PASSWORD_COOKIE_NAME,
      expect.objectContaining({ secure: true, path: '/' }),
    );
    expect(
      service.extractCapability({
        headers: { cookie: `${FIRST_PASSWORD_COOKIE_NAME}=${capability}` },
      } as Request),
    ).toBeUndefined();
  });

  it('reads only a well-formed capability from the expected cookie', () => {
    const service = createService(false);

    expect(
      service.extractCapability({
        headers: { cookie: `${FIRST_PASSWORD_COOKIE_NAME}=${capability}` },
      } as Request),
    ).toBe(capability);
    expect(
      service.extractCapability({
        headers: { cookie: `${FIRST_PASSWORD_COOKIE_NAME}=malformed` },
      } as Request),
    ).toBeUndefined();
  });

  it('requires an allowed Origin before issuing a browser capability', () => {
    const service = createService(true);
    const request = {
      headers: { origin: 'https://front.example.com' },
      protocol: 'https',
      get: () => 'crm.example.com',
    } as unknown as Request;

    expect(() => service.assertAllowedOrigin(request)).not.toThrow();
    request.headers.origin = 'https://evil.example.org';
    expect(() => service.assertAllowedOrigin(request)).toThrow();
    delete request.headers.origin;
    expect(() => service.assertAllowedOrigin(request)).toThrow();
  });
});
