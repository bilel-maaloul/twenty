import { Trans } from '@lingui/react';
import { BaseEmail } from 'src/components/BaseEmail';
import { HighlightedContainer } from 'src/components/HighlightedContainer';
import { HighlightedText } from 'src/components/HighlightedText';
import { MainText } from 'src/components/MainText';
import { Title } from 'src/components/Title';
import { createI18nInstance } from 'src/utils/i18n.utils';
import { type APP_LOCALES } from 'twenty-shared/translations';

type InteractiveLoginOtpEmailProps = {
  code: string;
  locale: keyof typeof APP_LOCALES;
};

export const InteractiveLoginOtpEmail = ({
  code,
  locale,
}: InteractiveLoginOtpEmailProps) => {
  const i18n = createI18nInstance(locale);

  return (
    <BaseEmail locale={locale}>
      <Title value={i18n._('Your SIMPLE sign-in code')} />
      <MainText>
        <Trans id="Enter this one-time code to finish signing in to SIMPLE." />
      </MainText>
      <br />
      <HighlightedContainer>
        <HighlightedText value={code} />
      </HighlightedContainer>
      <br />
      <MainText>
        <Trans id="This code expires in five minutes and can only be used once. If you did not request it, you can ignore this email." />
      </MainText>
    </BaseEmail>
  );
};

InteractiveLoginOtpEmail.PreviewProps = {
  code: '482913',
  locale: 'en',
} as InteractiveLoginOtpEmailProps;

export default InteractiveLoginOtpEmail;
