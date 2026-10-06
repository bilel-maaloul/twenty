import { isNonEmptyArray, isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'class-validator';

export const transformEmailsValue = (
  // oxlint-disable-next-line typescript/no-explicit-any
  value: any,
  // oxlint-disable-next-line typescript/no-explicit-any
): any => {
  if (!isDefined(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(value, 'primaryEmail')) {
    result.primaryEmail = isNonEmptyString(value.primaryEmail)
      ? value.primaryEmail.toLowerCase()
      : null;
  }

  let additionalEmails: string | null | undefined = value?.additionalEmails;

  if (Object.prototype.hasOwnProperty.call(value, 'additionalEmails')) {
    if (additionalEmails) {
      try {
        const emailArray = (
          isNonEmptyString(additionalEmails)
            ? JSON.parse(additionalEmails)
            : additionalEmails
        ) as string[];

        additionalEmails = isNonEmptyArray(emailArray)
          ? JSON.stringify(emailArray.map((email) => email.toLowerCase()))
          : null;
      } catch {
        /* empty */
      }
    }

    result.additionalEmails = additionalEmails;
  }

  return result;
};
