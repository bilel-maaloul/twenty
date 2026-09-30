import { ArgsType, Field } from '@nestjs/graphql';

import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

@ArgsType()
export class VerifyFirstPasswordInvitationPasscodeInput {
  @Field(() => String)
  @IsEmail()
  email: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  passcode: string;
}
