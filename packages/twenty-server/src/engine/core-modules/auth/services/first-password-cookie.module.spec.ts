import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type NextFunction, type Request, type Response } from 'express';

import { FirstPasswordCookieModule } from 'src/engine/core-modules/auth/services/first-password-cookie.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserSessionCookieService } from 'src/engine/core-modules/user-session/services/user-session-cookie.service';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { CookieSessionCsrfMiddleware } from 'src/engine/middlewares/cookie-session-csrf.middleware';

@Global()
@Module({
  providers: [
    {
      provide: TwentyConfigService,
      useValue: {
        get: (key: string) =>
          key === 'SERVER_URL' ? 'https://crm.example.com' : '',
      },
    },
  ],
  exports: [TwentyConfigService],
})
class TestConfigModule {}

describe('FirstPasswordCookieModule', () => {
  it('resolves the AppModule-applied middleware with the cookie service', async () => {
    const module = await Test.createTestingModule({
      imports: [TestConfigModule, FirstPasswordCookieModule],
      providers: [
        CookieSessionCsrfMiddleware,
        {
          provide: UserSessionCookieService,
          useValue: { extractSessionTokenFromRequest: () => undefined },
        },
        {
          provide: JwtWrapperService,
          useValue: { extractJwtFromRequest: () => () => undefined },
        },
      ],
    }).compile();

    const middleware = module.get(CookieSessionCsrfMiddleware);
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware.use(
      {
        method: 'POST',
        protocol: 'https',
        get: jest.fn().mockReturnValue('crm.example.com'),
        headers: {
          cookie: '__Host-twenty-first-password=capability',
          origin: 'https://other.example.com',
        },
      } as Request,
      response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    await module.close();
  });
});
