import { validate } from 'src/engine/core-modules/twenty-config/config-variables';
import { CaptchaDriverType } from 'src/engine/core-modules/captcha/interfaces';

describe('CAPTCHA_DRIVER configuration', () => {
  it.each(['GOOGLE_RECAPTCHA_V_2_CHECKBOX', 'GOOGLE_RECAPTCHA_V2_CHECKBOX'])(
    'accepts %s and resolves the canonical v2 value',
    (driver) => {
      const config = validate({ CAPTCHA_DRIVER: driver });

      expect(config.CAPTCHA_DRIVER).toBe(
        CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX,
      );
    },
  );
});
