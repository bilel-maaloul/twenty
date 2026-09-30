import { ArgsType, Field } from '@nestjs/graphql';

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@ArgsType()
export class CreateFirstPasswordInput {
  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  newPassword: string;

  @Field(() => String)
  @IsNotEmpty()
  @IsString()
  confirmPassword: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
