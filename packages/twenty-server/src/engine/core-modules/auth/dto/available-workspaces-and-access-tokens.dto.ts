import { Field, ObjectType } from '@nestjs/graphql';

import { AvailableWorkspaces } from 'src/engine/core-modules/auth/dto/available-workspaces.dto';

import { AuthTokenPair } from './auth-token-pair.dto';

@ObjectType('AvailableWorkspacesAndAccessTokens')
export class AvailableWorkspacesAndAccessTokensDTO {
  @Field(() => AuthTokenPair, { nullable: true })
  tokens?: AuthTokenPair | null;

  @Field(() => AvailableWorkspaces, { nullable: true })
  availableWorkspaces?: AvailableWorkspaces | null;

  @Field(() => Boolean, { nullable: true })
  requiresFirstPasswordCreation?: boolean | null;
}
