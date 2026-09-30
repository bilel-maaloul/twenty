import { Trans } from '@lingui/react';

import { BaseEmail } from 'src/components/BaseEmail';
import { CallToAction } from 'src/components/CallToAction';
import { HighlightedContainer } from 'src/components/HighlightedContainer';
import { HighlightedText } from 'src/components/HighlightedText';
import { MainText } from 'src/components/MainText';
import { Title } from 'src/components/Title';
import { createI18nInstance } from 'src/utils/i18n.utils';
import { type APP_LOCALES } from 'twenty-shared/translations';

type FirstLoginInvitationPasscodeEmailProps = {
  email: string;
  expiresAt: Date;
  link: string;
  locale: keyof typeof APP_LOCALES;
  passcode: string;
  userName: string;
  workspaceName: string;
};

export const FirstLoginInvitationPasscodeEmail = ({
  email,
  expiresAt,
  link,
  locale,
  passcode,
  userName,
  workspaceName,
}: FirstLoginInvitationPasscodeEmailProps) => {
  const i18n = createI18nInstance(locale);
  const formattedExpiry = i18n.date(expiresAt, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <BaseEmail locale={locale}>
      <Title value={i18n._('Your invitation to SIMPLE')} />
      <MainText>
        <Trans id="Hello {userName}," values={{ userName }} />
        <br />
        <br />
        <Trans
          id="An administrator invited {email} to {workspaceName}."
          values={{ email, workspaceName }}
        />
        <br />
        <Trans id="Open the SIMPLE sign-in page, choose invitation code, and enter this one-time passcode to create your password." />
        <br />
        <Trans
          id="This passcode expires on {formattedExpiry} UTC."
          values={{ formattedExpiry }}
        />
      </MainText>
      <br />
      <HighlightedContainer>
        <HighlightedText value={passcode} />
        <CallToAction href={link} value={i18n._('Sign in to SIMPLE')} />
      </HighlightedContainer>
      <br />
      <MainText>
        <Trans id="This passcode can only be used once for first-time password setup before the expiry shown above." />
      </MainText>
    </BaseEmail>
  );
};

FirstLoginInvitationPasscodeEmail.PreviewProps = {
  email: 'jane.doe@example.com',
  expiresAt: new Date('2026-01-01T12:00:00.000Z'),
  link: 'https://app.twenty.com/sign-in',
  locale: 'en',
  passcode: '123456',
  userName: 'Jane Doe',
  workspaceName: 'Acme Inc.',
} as FirstLoginInvitationPasscodeEmailProps;

export default FirstLoginInvitationPasscodeEmail;
