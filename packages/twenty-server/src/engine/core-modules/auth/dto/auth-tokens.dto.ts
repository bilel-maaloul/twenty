import { Field, ObjectType } from '@nestjs/graphql';

import { AuthTokenPair } from 'src/engine/core-modules/auth/dto/auth-token-pair.dto';
import { AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';

@ObjectType()
export class AuthTokens {
  @Field(() => AuthTokenPair, { nullable: true })
  tokens?: AuthTokenPair | null;

  @Field(() => AuthToken, { nullable: true })
  loginToken?: AuthToken | null;

  @Field(() => Boolean, { nullable: true })
  requiresEmailOtp?: boolean | null;

  @Field(() => String, { nullable: true })
  emailOtpChallengeId?: string | null;
}
