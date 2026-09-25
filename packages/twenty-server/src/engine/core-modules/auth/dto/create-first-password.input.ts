import { ArgsType, Field } from '@nestjs/graphql';

import { IsNotEmpty, IsString } from 'class-validator';

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
}
