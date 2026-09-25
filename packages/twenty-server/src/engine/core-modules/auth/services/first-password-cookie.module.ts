import { Module } from '@nestjs/common';

import { FirstPasswordCookieService } from 'src/engine/core-modules/auth/services/first-password-cookie.service';

@Module({
  providers: [FirstPasswordCookieService],
  exports: [FirstPasswordCookieService],
})
export class FirstPasswordCookieModule {}
