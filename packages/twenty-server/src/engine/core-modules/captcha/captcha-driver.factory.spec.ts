import { CaptchaDriverFactory } from 'src/engine/core-modules/captcha/captcha-driver.factory';
import { type CaptchaDriver } from 'src/engine/core-modules/captcha/drivers/interfaces/captcha-driver.interface';
import { CaptchaDriverType } from 'src/engine/core-modules/captcha/interfaces';

describe('CaptchaDriverFactory', () => {
  const createFactory = (driverType: CaptchaDriverType) => {
    const httpClient = {
      post: jest.fn().mockResolvedValue({ data: { success: true } }),
    };
    const config = {
      CAPTCHA_DRIVER: driverType,
      CAPTCHA_SITE_KEY: 'public-site-key',
      CAPTCHA_SECRET_KEY: 'private-secret-key',
    };
    const secureHttpClientService = {
      getHttpClient: jest.fn().mockReturnValue(httpClient),
    };
    const factory = new CaptchaDriverFactory(
      {
        get: (key: keyof typeof config) => config[key],
      } as never,
      {
        computeHash: jest.fn().mockReturnValue('captcha-config-hash'),
      } as never,
      secureHttpClientService as never,
    );

    return {
      createDriver: () =>
        (
          factory as unknown as {
            createDriver: () => CaptchaDriver | null;
          }
        ).createDriver(),
      factory,
      httpClient,
      secureHttpClientService,
    };
  };

  it.each([
    CaptchaDriverType.GOOGLE_RECAPTCHA,
    CaptchaDriverType.GOOGLE_RECAPTCHA_V_2_CHECKBOX,
  ])('uses Google siteverify for %s response tokens', async (driverType) => {
    const { createDriver, httpClient, secureHttpClientService } =
      createFactory(driverType);
    const driver = createDriver();

    await expect(driver?.validate('google-response-token')).resolves.toEqual({
      success: true,
    });
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith({
      baseURL: 'https://www.google.com/recaptcha/api/siteverify',
    });
    expect(httpClient.post).toHaveBeenCalledWith(
      '',
      expect.any(URLSearchParams),
    );
    const verificationBody = httpClient.post.mock
      .calls[0][1] as URLSearchParams;
    expect(verificationBody.get('response')).toBe('google-response-token');
  });

  it('keeps the Turnstile verification endpoint unchanged', () => {
    const { createDriver, secureHttpClientService } = createFactory(
      CaptchaDriverType.TURNSTILE,
    );

    expect(createDriver()).toBeDefined();
    expect(secureHttpClientService.getHttpClient).toHaveBeenCalledWith({
      baseURL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    });
  });
});
