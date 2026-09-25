import { Injectable } from '@nestjs/common';

import { type SendMailOptions } from 'nodemailer';

import { type EmailDriverInterface } from 'src/engine/core-modules/email/drivers/interfaces/email-driver.interface';

import { EmailDriverFactory } from 'src/engine/core-modules/email/email-driver.factory';

@Injectable()
export class EmailSenderService implements EmailDriverInterface {
  constructor(private readonly emailDriverFactory: EmailDriverFactory) {}

  async send(sendMailOptions: SendMailOptions): Promise<void> {
    const driver = this.emailDriverFactory.getCurrentDriver();

    await driver.send(sendMailOptions);
  }

  async verifySensitiveDelivery(): Promise<void> {
    const driver = this.emailDriverFactory.getSensitiveSmtpDriver();

    await driver.verifySensitiveDelivery();
  }

  async sendSensitive(sendMailOptions: SendMailOptions): Promise<void> {
    const driver = this.emailDriverFactory.getSensitiveSmtpDriver();

    await driver.sendSensitive(sendMailOptions);
  }
}
