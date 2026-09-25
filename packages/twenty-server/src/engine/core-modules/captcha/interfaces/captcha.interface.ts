import { registerEnumType } from '@nestjs/graphql';

export enum CaptchaDriverType {
  GOOGLE_RECAPTCHA = 'GOOGLE_RECAPTCHA',
  GOOGLE_RECAPTCHA_V_2_CHECKBOX = 'GOOGLE_RECAPTCHA_V_2_CHECKBOX',
  TURNSTILE = 'TURNSTILE',
}

registerEnumType(CaptchaDriverType, {
  name: 'CaptchaDriverType',
});

export type CaptchaDriverOptions = {
  siteKey: string;
  secretKey: string;
};

export type CaptchaValidateResult = { success: boolean; error?: string };
