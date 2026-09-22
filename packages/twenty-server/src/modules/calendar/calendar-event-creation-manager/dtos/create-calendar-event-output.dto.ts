import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('CreateCalendarEventOutput')
export class CreateCalendarEventOutputDTO {
  @Field(() => Boolean)
  success: boolean;

  // Stable cross-provider identifier; query the created event in Twenty by iCalUid.
  @Field(() => String, { nullable: true })
  iCalUid?: string;

  // A successful response always includes the local Twenty record id. It is
  // nullable only because failed mutations return an error response.
  @Field(() => String, { nullable: true })
  calendarEventId?: string;

  @Field(() => String, { nullable: true })
  conferenceLink?: string;

  @Field(() => String, { nullable: true })
  error?: string;
}
