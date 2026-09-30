import { ArgsType, Field } from '@nestjs/graphql';

import { IsString, Matches, IsUUID } from 'class-validator';

@ArgsType()
export class InteractiveEmailOtpVerificationInput {
  @Field(() => String)
  @IsUUID()
  challengeId: string;

  @Field(() => String)
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
