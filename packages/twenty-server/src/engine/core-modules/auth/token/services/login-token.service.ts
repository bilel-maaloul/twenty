import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { addMilliseconds } from 'date-fns';
import ms from 'ms';
import { Repository } from 'typeorm';

import { type AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { type LoginTokenJwtPayload } from 'src/engine/core-modules/auth/types/login-token-jwt-payload.type';
import { JwtTokenTypeEnum } from 'src/engine/core-modules/auth/types/jwt-token-type.enum';
import {
  assertUserCanAuthenticate,
  assertUserCredentialIsValid,
} from 'src/engine/core-modules/auth/utils/assert-user-credential-is-valid.util';
import { JwtWrapperService } from 'src/engine/core-modules/jwt/services/jwt-wrapper.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

@Injectable()
export class LoginTokenService {
  constructor(
    private readonly jwtWrapperService: JwtWrapperService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async generateLoginToken(
    email: string,
    workspaceId: string,
    authProvider: AuthProviderEnum,
    options?: { impersonatorUserWorkspaceId?: string },
  ): Promise<AuthToken> {
    if (!Object.values(AuthProviderEnum).includes(authProvider)) {
      throw new AuthException(
        'Authentication provider is required to generate a login token',
        AuthExceptionCode.INVALID_INPUT,
      );
    }

    const user = await this.userRepository.findOneBy({ email });

    if (!user) {
      throw new AuthException(
        'User not found',
        AuthExceptionCode.USER_NOT_FOUND,
      );
    }

    assertUserCanAuthenticate(user);

    const jwtPayload: LoginTokenJwtPayload = {
      type: JwtTokenTypeEnum.LOGIN,
      sub: email,
      workspaceId,
      authProvider,
      credentialEpoch: user.credentialEpoch,
      impersonatorUserWorkspaceId: options?.impersonatorUserWorkspaceId,
    };

    const expiresIn = this.twentyConfigService.get('LOGIN_TOKEN_EXPIRES_IN');

    const expiresAt = addMilliseconds(new Date().getTime(), ms(expiresIn));

    return {
      token: await this.jwtWrapperService.signAsyncOrThrow(jwtPayload, {
        expiresIn,
      }),
      expiresAt,
    };
  }

  async verifyLoginToken(loginToken: string): Promise<LoginTokenJwtPayload> {
    await this.jwtWrapperService.verifyJwtToken(loginToken);

    const decoded = this.jwtWrapperService.decode<LoginTokenJwtPayload>(
      loginToken,
      { json: true },
    );

    if (decoded.type !== JwtTokenTypeEnum.LOGIN) {
      throw new AuthException(
        'Expected a login token',
        AuthExceptionCode.INVALID_JWT_TOKEN_TYPE,
      );
    }

    if (!Object.values(AuthProviderEnum).includes(decoded.authProvider)) {
      throw new AuthException(
        'Login token has an invalid authentication provider',
        AuthExceptionCode.UNAUTHENTICATED,
      );
    }

    const user = await this.userRepository.findOneBy({ email: decoded.sub });

    if (!user) {
      throw new AuthException(
        'User not found',
        AuthExceptionCode.USER_NOT_FOUND,
      );
    }

    assertUserCredentialIsValid(user, decoded.credentialEpoch);

    return decoded;
  }
}
