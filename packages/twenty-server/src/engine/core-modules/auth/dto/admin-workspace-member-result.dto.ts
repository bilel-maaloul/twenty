import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum ProvisionWorkspaceMemberStatus {
  READY = 'READY',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
  DELIVERY_UNAVAILABLE = 'DELIVERY_UNAVAILABLE',
}

registerEnumType(ProvisionWorkspaceMemberStatus, {
  name: 'ProvisionWorkspaceMemberStatus',
});

export enum ResendTemporaryPasswordStatus {
  SENT = 'SENT',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  UNAVAILABLE = 'UNAVAILABLE',
  DELIVERY_UNAVAILABLE = 'DELIVERY_UNAVAILABLE',
}

registerEnumType(ResendTemporaryPasswordStatus, {
  name: 'ResendTemporaryPasswordStatus',
});

@ObjectType('ProvisionWorkspaceMemberResult')
export class ProvisionWorkspaceMemberResultDTO {
  @Field(() => ProvisionWorkspaceMemberStatus)
  status: ProvisionWorkspaceMemberStatus;
}

@ObjectType('ResendTemporaryPasswordResult')
export class ResendTemporaryPasswordResultDTO {
  @Field(() => ResendTemporaryPasswordStatus)
  status: ResendTemporaryPasswordStatus;
}
