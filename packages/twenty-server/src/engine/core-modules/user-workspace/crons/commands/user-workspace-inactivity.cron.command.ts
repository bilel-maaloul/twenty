import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { USER_WORKSPACE_INACTIVITY_CRON_PATTERN } from 'src/engine/core-modules/user-workspace/constants/user-workspace-inactivity.constant';
import { UserWorkspaceInactivityCronJob } from 'src/engine/core-modules/user-workspace/crons/jobs/user-workspace-inactivity.cron.job';

@Command({
  name: 'cron:user-workspace:suspend-inactive',
  description: 'Starts the daily inactive workspace membership suspension job',
})
export class UserWorkspaceInactivityCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron<undefined>({
      jobName: UserWorkspaceInactivityCronJob.name,
      data: undefined,
      options: {
        repeat: {
          pattern: USER_WORKSPACE_INACTIVITY_CRON_PATTERN,
        },
      },
    });
  }
}
