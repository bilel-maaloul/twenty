import { CaptchaDriverType } from '~/generated-metadata/graphql';

import { getCaptchaUrlByProvider } from '@/captcha/utils/getCaptchaUrlByProvider';

describe('getCaptchaUrlByProvider', () => {
  it('handles GoogleRecaptcha', async () => {
    const captchaUrl = getCaptchaUrlByProvider(
      CaptchaDriverType.GOOGLE_RECAPTCHA,
      'siteKey',
    );

    expect(captchaUrl).toEqual(
      'https://www.google.com/recaptcha/api.js?render=siteKey',
    );

    expect(() =>
      getCaptchaUrlByProvider(CaptchaDriverType.GOOGLE_RECAPTCHA, ''),
    ).toThrow(
      'SiteKey must be provided while generating url for GoogleRecaptcha provider',
    );
  });

  it('loads the explicit rendering API for the Google v2 checkbox', () => {
    expect(
      getCaptchaUrlByProvider(
        CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX,
        'siteKey',
      ),
    ).toEqual('https://www.google.com/recaptcha/api.js?render=explicit');
  });

  it('handles Turnstile', async () => {
    const captchaUrl = getCaptchaUrlByProvider(CaptchaDriverType.TURNSTILE, '');

    expect(captchaUrl).toEqual(
      'https://challenges.cloudflare.com/turnstile/v0/api.js',
    );
  });

  it('handles unknown provider', async () => {
    expect(() =>
      getCaptchaUrlByProvider('Unknown' as CaptchaDriverType, ''),
    ).toThrow('Unknown captcha provider');
  });
});
