import { Trans } from '@lingui/react';
import { BaseEmail } from 'src/components/BaseEmail';
import { HighlightedContainer } from 'src/components/HighlightedContainer';
import { HighlightedText } from 'src/components/HighlightedText';
import { MainText } from 'src/components/MainText';
import { Title } from 'src/components/Title';
import { createI18nInstance } from 'src/utils/i18n.utils';
import { type APP_LOCALES } from 'twenty-shared/translations';

type AdministratorTemporaryPasswordEmailProps = {
  email: string;
  expiresAt: Date;
  locale: keyof typeof APP_LOCALES;
  temporaryPassword: string;
  userName: string;
};

export const AdministratorTemporaryPasswordEmail = ({
  email,
  expiresAt,
  locale,
  temporaryPassword,
  userName,
}: AdministratorTemporaryPasswordEmailProps) => {
  const i18n = createI18nInstance(locale);
  const formattedExpiry = i18n.date(expiresAt, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return (
    <BaseEmail locale={locale}>
      <Title value={i18n._('Your Twenty account is ready')} />
      <MainText>
        <Trans id="Hello {userName}," values={{ userName }} />
        <br />
        <br />
        <Trans id="An administrator created a Twenty account for you." />
        <br />
        <Trans id="Account: {email}" values={{ email }} />
        <br />
        <Trans id="Use this temporary password to sign in through the normal Twenty login page. You will be required to create a permanent password after signing in." />
        <br />
        <Trans
          id="This temporary password expires on {formattedExpiry} UTC."
          values={{ formattedExpiry }}
        />
      </MainText>
      <br />
      <HighlightedContainer>
        <HighlightedText value={temporaryPassword} />
      </HighlightedContainer>
      <br />
      <MainText>
        <Trans id="This password is temporary. Change it immediately after signing in." />
      </MainText>
    </BaseEmail>
  );
};

AdministratorTemporaryPasswordEmail.PreviewProps = {
  expiresAt: new Date('2026-01-01T12:00:00.000Z'),
  email: 'jane.doe@example.com',
  locale: 'en',
  temporaryPassword: 'example-temporary-password',
  userName: 'Jane Doe',
} as AdministratorTemporaryPasswordEmailProps;

export default AdministratorTemporaryPasswordEmail;
