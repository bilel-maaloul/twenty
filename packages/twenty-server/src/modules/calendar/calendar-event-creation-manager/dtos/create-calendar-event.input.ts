import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateCalendarEventInput {
  @Field(() => String)
  connectedAccountId: string;

  @Field(() => String)
  title: string;

  @Field(() => String, { nullable: true })
  eventType?: string;

  @Field(() => String, { nullable: true })
  ownerId?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  location?: string;

  @Field(() => String)
  startsAt: string;

  @Field(() => String)
  endsAt: string;

  @Field(() => Boolean, { nullable: true })
  isFullDay?: boolean;

  @Field(() => String, { nullable: true })
  timeZone?: string;

  // Comma-separated attendee email addresses.
  @Field(() => String, { nullable: true })
  attendees?: string;

  @Field(() => Boolean, { nullable: true })
  sendInvitations?: boolean;

  @Field(() => Boolean, { nullable: true })
  addConferencing?: boolean;

  @Field(() => Int, { nullable: true })
  reminderMinutesBefore?: number;

  @Field(() => String, { nullable: true })
  recurrenceFrequency?: string;

  @Field(() => String, { nullable: true })
  recurrenceEndDate?: string;

  @Field(() => Int, { nullable: true })
  recurrenceOccurrences?: number;
}
