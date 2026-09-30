import { ArgsType, Field } from '@nestjs/graphql';

import { IsUUID } from 'class-validator';

@ArgsType()
export class ResendInteractiveEmailOtpInput {
  @Field(() => String)
  @IsUUID()
  challengeId: string;
}
