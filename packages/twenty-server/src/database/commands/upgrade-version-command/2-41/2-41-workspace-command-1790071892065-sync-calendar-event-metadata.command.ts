import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { getStandardFlatEntitiesToCreateOrThrow } from 'src/database/commands/upgrade-version-command/2-10/utils/get-standard-flat-entities-to-create-or-throw.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const CALENDAR_EVENT_FIELD_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarEvent.fields.eventType.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.fields.owner.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.fields.reminderMinutesBefore
    .universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.fields.recurrenceFrequency
    .universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.fields.recurrenceEndDate.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.fields.recurrenceOccurrences
    .universalIdentifier,
];

const CALENDAR_EVENT_RELATED_FIELD_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarEventTarget.fields.targetTask.universalIdentifier,
  STANDARD_OBJECTS.task.fields.calendarEventTargets.universalIdentifier,
  STANDARD_OBJECTS.workspaceMember.fields.ownedCalendarEvents
    .universalIdentifier,
];

const CALENDAR_EVENT_INDEX_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarEventTarget.indexes.taskIdIndex.universalIdentifier,
  STANDARD_OBJECTS.calendarEventTarget.indexes.calendarEventTaskUniqueIndex
    .universalIdentifier,
];

const CALENDAR_EVENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarEvent.views.allCalendarEvents.viewFields.eventType
    .universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.allCalendarEvents.viewFields.owner
    .universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .eventType.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .owner.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .reminderMinutesBefore.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .recurrenceFrequency.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .recurrenceEndDate.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.views.calendarEventRecordPageFields.viewFields
    .recurrenceOccurrences.universalIdentifier,
];

const REQUIRED_OBJECT_NAMES = [
  'calendarEvent',
  'calendarEventTarget',
  'task',
  'workspaceMember',
] as const;

@RegisteredWorkspaceCommand('2.41.0', 1790071892065)
@Command({
  name: 'upgrade:2-41:sync-calendar-event-metadata',
  description:
    'Create the calendar event fields, relations, indexes, and view fields added to the standard metadata',
})
export class SyncCalendarEventMetadataCommand extends ProvisionedWorkspaceCommandRunner {
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
    const isDryRun = options.dryRun ?? false;
    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
      flatViewMaps,
      flatViewFieldMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatIndexMaps',
      'flatViewMaps',
      'flatViewFieldMaps',
    ]);

    const missingObjectNames = REQUIRED_OBJECT_NAMES.filter(
      (objectName) =>
        !isDefined(
          flatObjectMetadataMaps.byUniversalIdentifier[
            STANDARD_OBJECTS[objectName].universalIdentifier
          ],
        ),
    );

    if (missingObjectNames.length > 0) {
      this.logger.warn(
        `Skipping calendar event metadata sync for workspace ${workspaceId}: missing ${missingObjectNames.join(', ')} metadata`,
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

    const fieldsToCreate = getStandardFlatEntitiesToCreateOrThrow<
      FlatFieldMetadata
    >({
      standardFlatEntityMaps: standardAllFlatEntityMaps.flatFieldMetadataMaps,
      existingFlatEntityMaps: flatFieldMetadataMaps,
      universalIdentifiers: [
        ...CALENDAR_EVENT_FIELD_UNIVERSAL_IDENTIFIERS,
        ...CALENDAR_EVENT_RELATED_FIELD_UNIVERSAL_IDENTIFIERS,
      ],
    });
    const indexesToCreate = getStandardFlatEntitiesToCreateOrThrow<
      FlatIndexMetadata
    >({
      standardFlatEntityMaps: standardAllFlatEntityMaps.flatIndexMaps,
      existingFlatEntityMaps: flatIndexMaps,
      universalIdentifiers: CALENDAR_EVENT_INDEX_UNIVERSAL_IDENTIFIERS,
    });
    const viewFieldsToCreate = getStandardFlatEntitiesToCreateOrThrow<
      FlatViewField
    >({
      standardFlatEntityMaps: standardAllFlatEntityMaps.flatViewFieldMaps,
      existingFlatEntityMaps: flatViewFieldMaps,
      universalIdentifiers: CALENDAR_EVENT_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
    }).filter(({ viewUniversalIdentifier }) =>
      isDefined(flatViewMaps.byUniversalIdentifier[viewUniversalIdentifier]),
    );

    const operationCount =
      fieldsToCreate.length + indexesToCreate.length + viewFieldsToCreate.length;

    if (operationCount === 0) {
      this.logger.log(
        `Calendar event metadata already exists for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    const creationSummary = `${fieldsToCreate.length} field(s), ${indexesToCreate.length} index(es), and ${viewFieldsToCreate.length} view field(s)`;

    if (isDryRun) {
      this.logger.log(
        `[DRY RUN] Would create ${creationSummary} for workspace ${workspaceId}`,
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
            fieldMetadata: {
              flatEntityToCreate: fieldsToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            index: {
              flatEntityToCreate: indexesToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            viewField: {
              flatEntityToCreate: viewFieldsToCreate,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
          },
        },
      );

    if (result.status === 'fail') {
      throw new Error(
        `Failed to sync calendar event metadata for workspace ${workspaceId}: ${JSON.stringify(result, null, 2)}`,
      );
    }

    this.logger.log(
      `Created ${creationSummary} for workspace ${workspaceId}`,
    );
  }
}
