import { Logger } from '@nestjs/common';

import { createTransport } from 'nodemailer';

import { SmtpDriver } from 'src/engine/core-modules/email/drivers/smtp.driver';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpDriver sensitive delivery', () => {
  const transport = {
    verify: jest.fn(),
    sendMail: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.mocked(createTransport).mockReturnValue(transport as never);
    transport.verify.mockReset();
    transport.sendMail.mockReset();
  });

  it('sanitizes sensitive SMTP preflight failures', async () => {
    const secret = 'smtp-password-marker';
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const driver = new SmtpDriver({ host: 'mail.example.com', port: 587 });

    transport.verify.mockRejectedValueOnce(new Error(secret));

    await expect(driver.verifySensitiveDelivery()).rejects.toThrow(
      'Sensitive email SMTP preflight failed',
    );
    expect(loggerError.mock.calls.flat().join(' ')).not.toContain(secret);
    driver.close();
  });

  it('sanitizes ambiguous SMTP send failures and logs no message body', async () => {
    const secret = 'sensitive-temporary-password';
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const loggerLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const driver = new SmtpDriver({ host: 'mail.example.com', port: 587 });

    transport.sendMail.mockRejectedValueOnce(new Error(secret));

    await expect(
      driver.sendSensitive({
        to: 'jane@example.com',
        subject: 'Temporary password',
        text: secret,
      }),
    ).rejects.toThrow('Sensitive email SMTP delivery failed');

    expect(loggerError.mock.calls.flat().join(' ')).not.toContain(secret);
    expect(loggerLog.mock.calls.flat().join(' ')).not.toContain(secret);
    driver.close();
  });
});
