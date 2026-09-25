import { EmailDriverFactory } from 'src/engine/core-modules/email/email-driver.factory';
import { EmailDriver } from 'src/engine/core-modules/email/enums/email-driver.enum';
import { ConfigGroupHashService } from 'src/engine/core-modules/twenty-config/services/config-group-hash.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

describe('EmailDriverFactory sensitive delivery', () => {
  const createFactory = (emailDriver: EmailDriver, noTls = false) => {
    const configValues: Record<string, unknown> = {
      EMAIL_DRIVER: emailDriver,
      EMAIL_SMTP_NO_TLS: noTls,
    };
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const configHash = {
      computeHash: jest.fn(() => 'email-config-hash'),
    };

    return new EmailDriverFactory(
      config as unknown as TwentyConfigService,
      configHash as unknown as ConfigGroupHashService,
    );
  };

  it('refuses sensitive delivery when the normal configured driver is LOGGER', () => {
    const factory = createFactory(EmailDriver.LOGGER);

    expect(() => factory.getSensitiveSmtpDriver()).toThrow(
      'Sensitive email delivery requires SMTP',
    );
  });

  it('refuses sensitive delivery when SMTP is configured without TLS', () => {
    const factory = createFactory(EmailDriver.SMTP, true);

    expect(() => factory.getSensitiveSmtpDriver()).toThrow(
      'Sensitive email delivery requires SMTP with TLS',
    );
  });
});
