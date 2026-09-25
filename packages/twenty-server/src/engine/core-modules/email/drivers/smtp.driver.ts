import { Logger } from '@nestjs/common';

import {
  createTransport,
  type SendMailOptions,
  type Transporter,
} from 'nodemailer';

import { type EmailDriverInterface } from 'src/engine/core-modules/email/drivers/interfaces/email-driver.interface';

import type SMTPConnection from 'nodemailer/lib/smtp-connection';

export class SmtpDriver implements EmailDriverInterface {
  private readonly logger = new Logger(SmtpDriver.name);
  private transport: Transporter;

  constructor(options: SMTPConnection.Options) {
    this.transport = createTransport({ ...options, pool: true });
  }

  close(): void {
    this.transport.close();
  }

  async send(sendMailOptions: SendMailOptions): Promise<void> {
    await this.transport.sendMail(sendMailOptions).catch((err) => {
      this.logger.error(`sending email to '${sendMailOptions.to}': ${err}`);

      throw err;
    });

    this.logger.log(`Email to '${sendMailOptions.to}' successfully sent`);
  }

  async verifySensitiveDelivery(): Promise<void> {
    try {
      await this.transport.verify();
    } catch {
      this.logger.error('Sensitive email SMTP preflight failed');
      throw new Error('Sensitive email SMTP preflight failed');
    }
  }

  async sendSensitive(sendMailOptions: SendMailOptions): Promise<void> {
    try {
      await this.transport.sendMail(sendMailOptions);
    } catch {
      this.logger.error('Sensitive email SMTP delivery failed');
      throw new Error('Sensitive email SMTP delivery failed');
    }

    this.logger.log('Sensitive email SMTP delivery completed');
  }
}
