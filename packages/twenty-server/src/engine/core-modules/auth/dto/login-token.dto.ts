import { Field, ObjectType } from '@nestjs/graphql';

import { AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';

@ObjectType('LoginToken')
export class LoginTokenDTO {
  @Field(() => AuthToken, { nullable: true })
  loginToken?: AuthToken | null;

  @Field(() => Boolean, { nullable: true })
  requiresFirstPasswordCreation?: boolean | null;
}
