import { Injectable, Logger } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { USER_WORKSPACE_INACTIVITY_CRON_PATTERN } from 'src/engine/core-modules/user-workspace/constants/user-workspace-inactivity.constant';
import { UserWorkspaceInactivityService } from 'src/engine/core-modules/user-workspace/services/user-workspace-inactivity.service';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class UserWorkspaceInactivityCronJob {
  private readonly logger = new Logger(UserWorkspaceInactivityCronJob.name);

  constructor(
    private readonly userWorkspaceInactivityService: UserWorkspaceInactivityService,
  ) {}

  @Process(UserWorkspaceInactivityCronJob.name)
  @SentryCronMonitor(
    UserWorkspaceInactivityCronJob.name,
    USER_WORKSPACE_INACTIVITY_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const suspendedMembershipCount =
      await this.userWorkspaceInactivityService.suspendInactiveMemberships();

    if (suspendedMembershipCount > 0) {
      this.logger.log(
        `Suspended ${suspendedMembershipCount} inactive workspace memberships`,
      );
    }
  }
}
