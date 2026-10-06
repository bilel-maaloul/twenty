import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const COMPANY_DOMAIN_NAME_UNIQUE_INDEX_UNIVERSAL_IDENTIFIER =
  'dd300c61-f422-467a-91f4-de4f83c4175b';

@RegisteredWorkspaceCommand('2.41.0', 1791279807780)
@Command({
  name: 'upgrade:2-41:remove-company-domain-name-unique-index',
  description:
    'Allow multiple Companies to share a Domain Name by removing its standard unique index',
})
export class RemoveCompanyDomainNameUniqueIndexCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { flatIndexMaps } = await this.workspaceCacheService.getOrRecompute(
      workspaceId,
      ['flatIndexMaps'],
    );
    const indexToDelete = Object.values(
      flatIndexMaps.byUniversalIdentifier,
    ).find(
      (index) =>
        isDefined(index) &&
        index.universalIdentifier ===
          COMPANY_DOMAIN_NAME_UNIQUE_INDEX_UNIVERSAL_IDENTIFIER,
    );

    if (!isDefined(indexToDelete)) {
      this.logger.log(
        `Company Domain Name unique index is already absent for workspace ${workspaceId}`,
      );

      return;
    }

    if (
      indexToDelete.applicationUniversalIdentifier !==
        TWENTY_STANDARD_APPLICATION.universalIdentifier ||
      indexToDelete.isCustom ||
      !indexToDelete.isSystemSideEffect ||
      !indexToDelete.isUnique ||
      indexToDelete.flatIndexFieldMetadatas.length !== 1 ||
      indexToDelete.flatIndexFieldMetadatas[0]
        ?.fieldMetadataUniversalIdentifier !==
        STANDARD_OBJECTS.company.fields.domainName.universalIdentifier
    ) {
      throw new Error(
        `Unexpected metadata for the Company Domain Name unique index in workspace ${workspaceId}`,
      );
    }

    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would remove the Company Domain Name unique index for workspace ${workspaceId}`,
      );

      return;
    }

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
        {
          isSystemBuild: true,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          workspaceId,
          allFlatEntityOperationByMetadataName: {
            index: {
              flatEntityToCreate: [],
              flatEntityToDelete: [indexToDelete],
              flatEntityToUpdate: [],
            },
          },
        },
      );

    if (result.status === 'fail') {
      throw new Error(
        `Failed to remove the Company Domain Name unique index for workspace ${workspaceId}: ${JSON.stringify(result, null, 2)}`,
      );
    }

    this.logger.log(
      `Removed the Company Domain Name unique index for workspace ${workspaceId}`,
    );
  }
}
