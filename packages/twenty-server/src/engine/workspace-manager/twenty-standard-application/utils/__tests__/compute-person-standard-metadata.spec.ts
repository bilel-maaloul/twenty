import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { validateAndReturnIndexWhereClause } from 'src/engine/workspace-manager/workspace-migration/utils/validate-index-where-clause.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const TWENTY_STANDARD_APPLICATION_ID = '20202020-2222-4222-8222-222222222222';
const NOW = '2024-01-01T00:00:00.000Z';

describe('Person standard metadata build', () => {
  it('only enforces Person email uniqueness for non-deleted records', () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: NOW,
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: TWENTY_STANDARD_APPLICATION_ID,
      });
    const emailIndex = Object.values(
      allFlatEntityMaps.flatIndexMaps.byUniversalIdentifier,
    ).find(
      (index) =>
        index?.objectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.person.universalIdentifier &&
        index?.universalFlatIndexFieldMetadatas.some(
          ({ fieldMetadataUniversalIdentifier }) =>
            fieldMetadataUniversalIdentifier ===
            STANDARD_OBJECTS.person.fields.emails.universalIdentifier,
        ),
    );

    expect(emailIndex).toMatchObject({
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    });
    expect(
      validateAndReturnIndexWhereClause(emailIndex?.indexWhereClause),
    ).toBe('"deletedAt" IS NULL');
  });
});
