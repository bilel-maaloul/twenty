import { ArgsType, Field } from '@nestjs/graphql';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@ArgsType()
export class UpdatePasswordViaResetTokenInput {
  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  passwordResetToken: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  newPassword: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
