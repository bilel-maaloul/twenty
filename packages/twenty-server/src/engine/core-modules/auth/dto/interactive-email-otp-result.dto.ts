import { Field, ObjectType } from '@nestjs/graphql';

import { AvailableWorkspaces } from 'src/engine/core-modules/auth/dto/available-workspaces.dto';
import { AuthToken } from 'src/engine/core-modules/auth/dto/auth-token.dto';
import { AuthTokenPair } from 'src/engine/core-modules/auth/dto/auth-token-pair.dto';
import { WorkspaceUrlsDTO } from 'src/engine/core-modules/workspace/dtos/workspace-urls.dto';

@ObjectType('InteractiveEmailOtpResult')
export class InteractiveEmailOtpResultDTO {
  @Field(() => AuthTokenPair, { nullable: true })
  tokens?: AuthTokenPair | null;

  @Field(() => AvailableWorkspaces, { nullable: true })
  availableWorkspaces?: AvailableWorkspaces | null;

  @Field(() => AuthToken, { nullable: true })
  loginToken?: AuthToken | null;

  @Field(() => WorkspaceUrlsDTO, { nullable: true })
  workspaceUrls?: WorkspaceUrlsDTO | null;
}
