import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type CookieOptions, type Request, type Response } from 'express';

import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { isRequestOriginAllowed } from 'src/engine/core-modules/user-session/utils/is-request-origin-allowed.util';

export const FIRST_PASSWORD_SECURE_COOKIE_NAME = '__Host-twenty-first-password';
export const FIRST_PASSWORD_COOKIE_NAME = 'twenty-first-password';

const FIRST_PASSWORD_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class FirstPasswordCookieService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  assertAllowedOrigin(request: Request): void {
    const origin = request.headers.origin;

    if (
      !isNonEmptyString(origin) ||
      !isRequestOriginAllowed({
        origin,
        request,
        twentyConfigService: this.twentyConfigService,
      })
    ) {
      throw new AuthException(
        'Request origin is not allowed for first-password creation',
        AuthExceptionCode.FORBIDDEN_EXCEPTION,
      );
    }
  }

  private isSecureDeployment(): boolean {
    const serverUrl = this.twentyConfigService.get('SERVER_URL');

    try {
      return (
        new URL(serverUrl).protocol === 'https:' ||
        this.twentyConfigService.get('AUTH_COOKIE_SAME_SITE') === 'none'
      );
    } catch {
      return this.twentyConfigService.get('AUTH_COOKIE_SAME_SITE') === 'none';
    }
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isSecureDeployment(),
      sameSite: this.twentyConfigService.get('AUTH_COOKIE_SAME_SITE'),
      path: '/',
    };
  }

  hasFirstPasswordCookie(request: Request): boolean {
    const header = request.headers.cookie;

    return (
      isNonEmptyString(header) &&
      header.split(';').some((part) => {
        const name = part.split('=', 1)[0]?.trim();

        return (
          name === FIRST_PASSWORD_SECURE_COOKIE_NAME ||
          name === FIRST_PASSWORD_COOKIE_NAME
        );
      })
    );
  }

  extractCapability(request: Request): string | undefined {
    const header = request.headers.cookie;

    if (!isNonEmptyString(header)) {
      return undefined;
    }

    const cookieName = this.isSecureDeployment()
      ? FIRST_PASSWORD_SECURE_COOKIE_NAME
      : FIRST_PASSWORD_COOKIE_NAME;

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');

      if (separator < 0 || part.slice(0, separator).trim() !== cookieName) {
        continue;
      }

      const capability = part.slice(separator + 1).trim();

      return FIRST_PASSWORD_CAPABILITY_PATTERN.test(capability)
        ? capability
        : undefined;
    }

    return undefined;
  }

  attachCapability(
    response: Response,
    capability: string,
    expiresAt: Date,
  ): void {
    response.cookie(
      this.isSecureDeployment()
        ? FIRST_PASSWORD_SECURE_COOKIE_NAME
        : FIRST_PASSWORD_COOKIE_NAME,
      capability,
      { ...this.cookieOptions(), expires: expiresAt },
    );
  }

  clearCapability(response: Response): void {
    const options = this.cookieOptions();

    response.clearCookie(FIRST_PASSWORD_SECURE_COOKIE_NAME, options);
    response.clearCookie(FIRST_PASSWORD_COOKIE_NAME, options);
  }
}
