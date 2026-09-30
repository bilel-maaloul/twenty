import { Field, ObjectType } from '@nestjs/graphql';

import { WorkspaceUrlsDTO } from 'src/engine/core-modules/workspace/dtos/workspace-urls.dto';

import { AuthToken } from './auth-token.dto';

@ObjectType('VerifyEmailAndGetLoginToken')
export class VerifyEmailAndGetLoginTokenDTO {
  @Field(() => AuthToken, { nullable: true })
  loginToken?: AuthToken | null;

  @Field(() => WorkspaceUrlsDTO)
  workspaceUrls: WorkspaceUrlsDTO;

  @Field(() => Boolean, { nullable: true })
  requiresEmailOtp?: boolean | null;

  @Field(() => String, { nullable: true })
  emailOtpChallengeId?: string | null;
}
