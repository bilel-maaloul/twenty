import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { SyncCalendarEventMetadataCommand } from 'src/database/commands/upgrade-version-command/2-41/2-41-workspace-command-1790071892065-sync-calendar-event-metadata.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
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

const setup = () => {
  const standardAllFlatEntityMaps =
    computeTwentyStandardApplicationAllFlatEntityMaps({
      now: new Date().toISOString(),
      workspaceId: WORKSPACE_ID,
      twentyStandardApplicationId: STANDARD_APPLICATION_ID,
    }).allFlatEntityMaps;
  const requiredObjects = [
    'calendarEvent',
    'calendarEventTarget',
    'task',
    'workspaceMember',
  ].map(
    (objectName) =>
      standardAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        STANDARD_OBJECTS[objectName].universalIdentifier
      ],
  );
  const calendarEventViews = Object.values(
    standardAllFlatEntityMaps.flatViewMaps.byUniversalIdentifier,
  ).filter(
    (view) =>
      isDefined(view) &&
      view.objectMetadataUniversalIdentifier ===
        STANDARD_OBJECTS.calendarEvent.universalIdentifier,
  );
  const validateBuildAndRunLegacyWorkspaceMigration = jest
    .fn()
    .mockResolvedValue({ status: 'success' });
  const command = new SyncCalendarEventMetadataCommand(
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
        flatObjectMetadataMaps: buildByUniversalIdentifierMap(
          requiredObjects.filter(isDefined),
        ),
        flatFieldMetadataMaps: buildByUniversalIdentifierMap([]),
        flatIndexMaps: buildByUniversalIdentifierMap([]),
        flatViewMaps: buildByUniversalIdentifierMap(
          calendarEventViews.filter(isDefined),
        ),
        flatViewFieldMaps: buildByUniversalIdentifierMap([]),
      }),
    } as unknown as WorkspaceCacheService,
    {
      validateBuildAndRunLegacyWorkspaceMigration,
    } as unknown as WorkspaceMigrationValidateBuildAndRunService,
  );

  return { command, validateBuildAndRunLegacyWorkspaceMigration };
};

describe('SyncCalendarEventMetadataCommand', () => {
  it('creates the calendar event fields and related metadata missing from an existing workspace', async () => {
    const { command, validateBuildAndRunLegacyWorkspaceMigration } = setup();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: {},
    } as Parameters<typeof command.runOnWorkspace>[0]);

    const operations =
      validateBuildAndRunLegacyWorkspaceMigration.mock.calls[0][0]
        .allFlatEntityOperationByMetadataName;

    expect(
      operations.fieldMetadata.flatEntityToCreate.map(
        (field) => field.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'eventType',
        'owner',
        'reminderMinutesBefore',
        'recurrenceFrequency',
        'recurrenceEndDate',
        'recurrenceOccurrences',
      ]),
    );
    expect(operations.viewField.flatEntityToCreate.length).toBeGreaterThan(0);
    expect(operations.index.flatEntityToCreate.length).toBe(2);
  });

  it('does not run a migration during a dry run', async () => {
    const { command, validateBuildAndRunLegacyWorkspaceMigration } = setup();

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: { dryRun: true },
    } as Parameters<typeof command.runOnWorkspace>[0]);

    expect(validateBuildAndRunLegacyWorkspaceMigration).not.toHaveBeenCalled();
  });
});
