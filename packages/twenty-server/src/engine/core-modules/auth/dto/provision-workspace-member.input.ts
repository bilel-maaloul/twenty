import { ArgsType, Field } from '@nestjs/graphql';

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ArgsType()
export class ProvisionWorkspaceMemberInput {
  @Field(() => String)
  @IsEmail()
  email: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  @IsUUID()
  roleId?: string | null;
}
