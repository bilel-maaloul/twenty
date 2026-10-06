import { FieldMetadataType } from 'twenty-shared/types';

import { CommonImportPreflightQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-import-preflight-query-runner/common-import-preflight-query-runner.service';
import { findExistingRecords } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/find-existing-records.util';
import { type CommonExtendedQueryRunnerContext } from 'src/engine/api/common/types/common-extended-query-runner-context.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

jest.mock(
  'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/find-existing-records.util',
  () => ({
    findExistingRecords: jest.fn(),
  }),
);

describe('CommonImportPreflightQueryRunnerService', () => {
  const fields = [
    {
      id: 'id-field',
      universalIdentifier: 'id-field',
      name: 'id',
      type: FieldMetadataType.UUID,
    },
    {
      id: 'source-id-field',
      universalIdentifier: 'source-id-field',
      name: 'sourceId',
      type: FieldMetadataType.TEXT,
    },
    {
      id: 'name-field',
      universalIdentifier: 'name-field',
      name: 'name',
      type: FieldMetadataType.TEXT,
    },
  ] as unknown as OrmFlatFieldMetadata[];

  const uniqueIndexes = [
    {
      id: 'source-id-index',
      universalIdentifier: 'source-id-index',
      name: 'sourceIdUnique',
      isUnique: true,
      flatIndexFieldMetadatas: [
        {
          id: 'source-id-index-field',
          universalIdentifier: 'source-id-index-field',
          indexMetadataId: 'source-id-index',
          fieldMetadataId: 'source-id-field',
          subFieldName: null,
          order: 0,
        },
      ],
    },
    {
      id: 'name-index',
      universalIdentifier: 'name-index',
      name: 'nameUnique',
      isUnique: true,
      flatIndexFieldMetadatas: [
        {
          id: 'name-index-field',
          universalIdentifier: 'name-index-field',
          indexMetadataId: 'name-index',
          fieldMetadataId: 'name-field',
          subFieldName: null,
          order: 0,
        },
      ],
    },
  ] as unknown as FlatIndexMetadata[];

  const flatObjectMetadata = {
    id: 'object-metadata-id',
    nameSingular: 'testObject',
    fieldIds: fields.map((field) => field.id),
    indexMetadataIds: uniqueIndexes.map((index) => index.id),
  } as unknown as FlatObjectMetadata;

  const flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata> = {
    byUniversalIdentifier: Object.fromEntries(
      fields.map((field) => [field.universalIdentifier, field]),
    ),
    universalIdentifierById: Object.fromEntries(
      fields.map((field) => [field.id, field.universalIdentifier]),
    ),
    universalIdentifiersByApplicationId: {},
  };

  const flatIndexMaps: FlatEntityMaps<FlatIndexMetadata> = {
    byUniversalIdentifier: Object.fromEntries(
      uniqueIndexes.map((index) => [index.universalIdentifier, index]),
    ),
    universalIdentifierById: Object.fromEntries(
      uniqueIndexes.map((index) => [index.id, index.universalIdentifier]),
    ),
    universalIdentifiersByApplicationId: {},
  };

  const queryRunnerContext = {
    flatObjectMetadata,
    flatFieldMetadataMaps,
    flatIndexMaps,
    repository: {},
  } as unknown as CommonExtendedQueryRunnerContext;

  const runPreflight = async (
    data: Array<Record<string, unknown>>,
    existingRecords: Array<Record<string, unknown>>,
    sourceStates?: Array<
      Array<{
        fieldMetadataId: string;
        subFieldPath: string[];
        state: 'EMPTY' | 'VALUE';
      }>
    >,
  ) => {
    jest.mocked(findExistingRecords).mockResolvedValue(existingRecords);

    return new CommonImportPreflightQueryRunnerService().run(
      {
        data,
        rowIds: data.map((_, index) => `row-${index}`),
        sourceStates,
      },
      queryRunnerContext,
    );
  };

  beforeEach(() => {
    jest.mocked(findExistingRecords).mockReset();
  });

  it('classifies new and exact rows while preserving stable row identifiers', async () => {
    await expect(
      runPreflight(
        [
          { sourceId: '10001', name: 'New Company' },
          { sourceId: '10002', name: 'Existing Company' },
        ],
        [{ id: 'record-2', sourceId: '10002', name: 'Existing Company' }],
      ),
    ).resolves.toEqual([
      expect.objectContaining({ rowId: 'row-0', status: 'NEW' }),
      expect.objectContaining({
        rowId: 'row-1',
        status: 'EXACT_EXISTING_MATCH',
        existingRecordId: 'record-2',
        matchedConstraintIds: ['source-id-index', 'name-index'],
      }),
    ]);
  });

  it('classifies a matched row with changed values', async () => {
    await expect(
      runPreflight(
        [{ sourceId: '10003', name: 'Changed Company' }],
        [{ id: 'record-3', sourceId: '10003', name: 'Existing Company' }],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'EXISTING_WITH_CHANGES',
        changedFieldNames: ['name'],
      }),
    ]);
  });

  it('classifies a blank mapped cell over a non-empty existing value as a review difference', async () => {
    await expect(
      runPreflight(
        [{ sourceId: '10006' }],
        [{ id: 'record-6', sourceId: '10006', name: 'Existing name' }],
        [
          [
            {
              fieldMetadataId: 'name-field',
              subFieldPath: [],
              state: 'EMPTY',
            },
          ],
        ],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'EXISTING_WITH_CHANGES',
        changedFieldNames: ['name'],
        fieldDifferences: [
          expect.objectContaining({
            fieldMetadataId: 'name-field',
            fieldName: 'name',
            existingValue: 'Existing name',
            incomingValue: null,
            sourceState: 'EMPTY',
          }),
        ],
      }),
    ]);
  });

  it('classifies matches to different unique records as a conflict', async () => {
    await expect(
      runPreflight(
        [{ sourceId: '10004', name: 'Existing Company' }],
        [
          { id: 'record-4', sourceId: '10004', name: 'Other Company' },
          { id: 'record-5', sourceId: '10005', name: 'Existing Company' },
        ],
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'CONFLICT',
        matchedRecordIds: ['record-4', 'record-5'],
      }),
    ]);
  });
});
