import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RebuildPersonEmailUniqueIndexCommand } from 'src/database/commands/upgrade-version-command/2-41/2-41-workspace-command-1790071892066-rebuild-person-email-unique-index.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-0000000000a1';

const buildByUniversalIdentifierMap = <
  TEntity extends { universalIdentifier: string },
>(entities: TEntity[]) => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
});

const setup = ({
  duplicateEmails = [],
}: {
  duplicateEmails?: Array<{ email: string; recordIds: string[] }>;
} = {}) => {
  const standardAllFlatEntityMaps =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId: WORKSPACE_ID,
      twentyStandardApplicationId: STANDARD_APPLICATION_ID,
    }).allFlatEntityMaps;
  const personObjectMetadata =
    standardAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.person.universalIdentifier
    ];
  const personEmailsFieldMetadata =
    standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.person.fields.emails.universalIdentifier
    ];
  const standardPersonEmailIndex = Object.values(
    standardAllFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
  ).find(
    (index) =>
      isDefined(index) &&
      index.objectMetadataUniversalIdentifier ===
        STANDARD_OBJECTS.person.universalIdentifier &&
      index.universalFlatIndexFieldMetadatas.some(
        ({ fieldMetadataUniversalIdentifier }) =>
          fieldMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.person.fields.emails.universalIdentifier,
      ),
  );

  if (
    !isDefined(personObjectMetadata) ||
    !isDefined(personEmailsFieldMetadata) ||
    !isDefined(standardPersonEmailIndex)
  ) {
    throw new Error('Could not build standard Person email metadata for test');
  }

  const stalePersonEmailIndex: FlatIndexMetadata = {
    ...standardPersonEmailIndex,
    id: 'old-person-email-index-id',
    indexWhereClause: null,
    name: 'IDX_UNIQUE_OLD_PERSON_EMAIL',
    universalIdentifier: 'old-person-email-index-universal-identifier',
  };
  const validateBuildAndRunLegacyWorkspaceMigration = jest
    .fn()
    .mockResolvedValue({ status: 'success' });
  const query = jest.fn().mockResolvedValue(duplicateEmails);
  const command = new RebuildPersonEmailUniqueIndexCommand(
    {} as WorkspaceIteratorService,
    {
      findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
        .fn()
        .mockResolvedValue({
          twentyStandardFlatApplication: {
            id: STANDARD_APPLICATION_ID,
            universalIdentifier: 'standard-application-universal-identifier',
          },
        }),
    } as unknown as ApplicationService,
    {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatFieldMetadataMaps: buildByUniversalIdentifierMap<FlatFieldMetadata>(
          [personEmailsFieldMetadata],
        ),
        flatIndexMaps: buildByUniversalIdentifierMap<FlatIndexMetadata>([
          stalePersonEmailIndex,
        ]),
        flatObjectMetadataMaps:
          buildByUniversalIdentifierMap<FlatObjectMetadata>([
            personObjectMetadata,
          ]),
      }),
    } as unknown as WorkspaceCacheService,
    {
      validateBuildAndRunLegacyWorkspaceMigration,
    } as unknown as WorkspaceMigrationValidateBuildAndRunService,
  );

  return {
    command,
    query,
    validateBuildAndRunLegacyWorkspaceMigration,
    standardPersonEmailIndex,
  };
};

describe('RebuildPersonEmailUniqueIndexCommand', () => {
  it('preflights active duplicates and replaces the old index with the partial index', async () => {
    const {
      command,
      query,
      validateBuildAndRunLegacyWorkspaceMigration,
      standardPersonEmailIndex,
    } = setup();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      dataSource: { query } as never,
      options: {},
      index: 0,
      total: 1,
    } as Parameters<typeof command.runOnWorkspace>[0]);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('"deletedAt" IS NULL'));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"emailsPrimaryEmail"'),
    );

    const operations =
      validateBuildAndRunLegacyWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName.index;

    expect(operations.flatEntityToDelete).toHaveLength(1);
    expect(operations.flatEntityToCreate).toHaveLength(1);
    expect(operations.flatEntityToCreate[0]).toMatchObject({
      universalIdentifier: standardPersonEmailIndex.universalIdentifier,
      indexWhereClause: '"deletedAt" IS NULL',
      isUnique: true,
    });
  });

  it('aborts before changing metadata when active duplicate emails exist', async () => {
    const {
      command,
      validateBuildAndRunLegacyWorkspaceMigration,
    } = setup({
      duplicateEmails: [
        {
          email: 'duplicate@example.com',
          recordIds: ['person-1', 'person-2'],
        },
      ],
    });

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        dataSource: {
          query: jest.fn().mockResolvedValue([
            {
              email: 'duplicate@example.com',
              recordIds: ['person-1', 'person-2'],
            },
          ]),
        } as never,
        options: {},
        index: 0,
        total: 1,
      } as Parameters<typeof command.runOnWorkspace>[0]),
    ).rejects.toThrow(
      'active duplicate emails must be resolved before migration',
    );

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });

  it('checks duplicates during a dry run without applying the migration', async () => {
    const { command, query, validateBuildAndRunLegacyWorkspaceMigration } =
      setup();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      dataSource: { query } as never,
      options: { dryRun: true },
      index: 0,
      total: 1,
    } as Parameters<typeof command.runOnWorkspace>[0]);

    expect(query).toHaveBeenCalled();
    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });
});
