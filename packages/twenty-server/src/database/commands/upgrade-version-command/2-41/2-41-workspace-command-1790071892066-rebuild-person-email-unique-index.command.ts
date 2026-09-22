import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { emailsCompositeType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { computeCompositeColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-column-name.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaContextForMigration } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/get-workspace-schema-context-for-migration.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const PERSON_EMAIL_INDEX_WHERE_CLAUSE = '"deletedAt" IS NULL';

type DuplicatePersonEmailRow = {
  email: string;
  recordIds: string[];
};

@RegisteredWorkspaceCommand('2.41.0', 1790071892066)
@Command({
  name: 'upgrade:2-41:rebuild-person-email-unique-index',
  description:
    'Rebuild the Person email unique index so soft-deleted records do not reserve email addresses',
})
export class RebuildPersonEmailUniqueIndexCommand extends ProvisionedWorkspaceCommandRunner {
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
    dataSource,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      this.logger.warn(
        `Skipping Person email unique index rebuild for workspace ${workspaceId}: no workspace data source`,
      );

      return;
    }

    const {
      flatFieldMetadataMaps,
      flatIndexMaps,
      flatObjectMetadataMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatFieldMetadataMaps',
      'flatIndexMaps',
      'flatObjectMetadataMaps',
    ]);

    const personObjectMetadata = findFlatEntityByUniversalIdentifier({
      flatEntityMaps: flatObjectMetadataMaps,
      universalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    });
    const personEmailsFieldMetadata = findFlatEntityByUniversalIdentifier({
      flatEntityMaps: flatFieldMetadataMaps,
      universalIdentifier: STANDARD_OBJECTS.person.fields.emails
        .universalIdentifier,
    });

    if (
      !isDefined(personObjectMetadata) ||
      !isDefined(personEmailsFieldMetadata)
    ) {
      this.logger.warn(
        `Skipping Person email unique index rebuild for workspace ${workspaceId}: Person or emails metadata is missing`,
      );

      return;
    }

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const { allFlatEntityMaps: standardAllFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: new Date().toISOString(),
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });
    const standardPersonEmailIndex = Object.values(
      standardAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    ).find(
      (index): index is FlatIndexMetadata =>
        isDefined(index) &&
        index.objectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.person.universalIdentifier &&
        index.applicationUniversalIdentifier ===
          TWENTY_STANDARD_APPLICATION.universalIdentifier &&
        index.isUnique &&
        index.indexWhereClause === PERSON_EMAIL_INDEX_WHERE_CLAUSE &&
        index.universalFlatIndexFieldMetadatas.length === 1 &&
        index.universalFlatIndexFieldMetadatas[0]
          ?.fieldMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.person.fields.emails.universalIdentifier,
    );

    if (!isDefined(standardPersonEmailIndex)) {
      throw new Error(
        `Could not compute the standard Person email unique index for workspace ${workspaceId}`,
      );
    }

    const existingPersonEmailIndexes = Object.values(
      flatIndexMaps.byUniversalIdentifier,
    ).filter(
      (index): index is FlatIndexMetadata =>
        isDefined(index) &&
        index.applicationUniversalIdentifier ===
          TWENTY_STANDARD_APPLICATION.universalIdentifier &&
        index.isSystemSideEffect &&
        index.objectMetadataId === personObjectMetadata.id &&
        index.isUnique &&
        index.flatIndexFieldMetadatas.length === 1 &&
        index.flatIndexFieldMetadatas[0]?.fieldMetadataId ===
          personEmailsFieldMetadata.id,
    );

    const staleIndexes = existingPersonEmailIndexes.filter(
      (index) =>
        index.indexWhereClause !== PERSON_EMAIL_INDEX_WHERE_CLAUSE,
    );
    const hasDesiredIndex = existingPersonEmailIndexes.some(
      (index) =>
        index.indexWhereClause === PERSON_EMAIL_INDEX_WHERE_CLAUSE,
    );

    if (staleIndexes.length === 0 && hasDesiredIndex) {
      this.logger.log(
        `Person email unique index already ignores deleted records for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    const shouldCreateDesiredIndex = !hasDesiredIndex;

    if (shouldCreateDesiredIndex) {
      const duplicateEmails = await this.findActiveDuplicateEmails({
        dataSource,
        workspaceId,
        personObjectMetadata,
        personEmailsFieldMetadata,
      });

      if (duplicateEmails.length > 0) {
        const duplicateSummary = duplicateEmails
          .map(
            ({ email, recordIds }) =>
              `${email} (person ids: ${recordIds.join(', ')})`,
          )
          .join('; ');

        throw new Error(
          `Cannot rebuild the Person email unique index for workspace ${workspaceId}: active duplicate emails must be resolved before migration: ${duplicateSummary}`,
        );
      }
    }

    const indexesToCreate = shouldCreateDesiredIndex
      ? [standardPersonEmailIndex]
      : [];

    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would replace ${staleIndexes.length} Person email unique index(es) with ${indexesToCreate.length} partial unique index(es) for workspace ${workspaceId}`,
      );

      return;
    }

    const result =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
        {
          isSystemBuild: true,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          workspaceId,
          allFlatEntityOperationByMetadataName: {
            index: {
              flatEntityToCreate: indexesToCreate,
              flatEntityToDelete: staleIndexes,
              flatEntityToUpdate: [],
            },
          },
        },
      );

    if (result.status === 'fail') {
      throw new Error(
        `Failed to rebuild the Person email unique index for workspace ${workspaceId}: ${JSON.stringify(result, null, 2)}`,
      );
    }

    this.logger.log(
      `Rebuilt the Person email unique index for workspace ${workspaceId}; deleted records no longer reserve email addresses`,
    );
  }

  private async findActiveDuplicateEmails({
    dataSource,
    workspaceId,
    personObjectMetadata,
    personEmailsFieldMetadata,
  }: {
    dataSource: NonNullable<RunOnWorkspaceArgs['dataSource']>;
    workspaceId: string;
    personObjectMetadata: FlatObjectMetadata;
    personEmailsFieldMetadata: FlatFieldMetadata;
  }): Promise<DuplicatePersonEmailRow[]> {
    const { schemaName, tableName } = getWorkspaceSchemaContextForMigration({
      workspaceId,
      objectMetadata: personObjectMetadata,
    });
    const emailColumnName = computeCompositeColumnName(
      personEmailsFieldMetadata,
      emailsCompositeType.properties[0],
    );

    return dataSource.query<DuplicatePersonEmailRow[]>(
      `SELECT "${emailColumnName}" AS "email",
              ARRAY_AGG("id"::text ORDER BY "id") AS "recordIds"
         FROM "${schemaName}"."${tableName}"
        WHERE "deletedAt" IS NULL
          AND "${emailColumnName}" IS NOT NULL
        GROUP BY "${emailColumnName}"
       HAVING COUNT(*) > 1
        ORDER BY "${emailColumnName}"`,
    );
  }
}
