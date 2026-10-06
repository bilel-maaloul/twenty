import { type ObjectRecord } from 'twenty-shared/types';
import { Brackets, type ObjectLiteral } from 'typeorm';

import { type ConflictingFieldGroup } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/types/conflicting-field-group.type';
import { type PartialObjectRecordWithId } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/types/partial-object-record-with-id.type';
import { buildWhereConditions } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/utils/build-where-conditions.util';
import { type OrmFlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/orm-flat-field-metadata.type';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { getAllSelectableColumnNames } from 'src/engine/api/utils/get-all-selectable-column-names.utils';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';

export const findExistingRecords = async ({
  repository,
  flatObjectMetadata,
  flatFieldMetadataMaps,
  records,
  conflictingFieldGroups,
}: {
  repository: WorkspaceRepository<ObjectLiteral>;
  flatObjectMetadata: FlatObjectMetadata;
  flatFieldMetadataMaps: FlatEntityMaps<OrmFlatFieldMetadata>;
  records: Partial<ObjectRecord>[];
  conflictingFieldGroups: ConflictingFieldGroup[];
}): Promise<PartialObjectRecordWithId[]> => {
  const whereConditions = buildWhereConditions(records, conflictingFieldGroups);

  if (whereConditions.length === 0) {
    return [];
  }

  const queryBuilder = repository.createQueryBuilder(
    flatObjectMetadata.nameSingular,
  );

  queryBuilder.andWhere(
    new Brackets((whereBuilder) => {
      whereConditions.forEach((condition, index) => {
        if (index === 0) {
          whereBuilder.where(condition);
        } else {
          whereBuilder.orWhere(condition);
        }
      });
    }),
  );

  const restrictedFields =
    repository.objectRecordsPermissions?.[flatObjectMetadata.id]
      ?.restrictedFields;

  const selectOptions = getAllSelectableColumnNames({
    restrictedFields: restrictedFields ?? {},
    objectMetadata: {
      objectMetadataMapItem: flatObjectMetadata,
      flatFieldMetadataMaps,
    },
  });

  // Preflight must see the same soft-deleted matches as the authoritative upsert.
  return (await queryBuilder
    .withDeleted()
    .setFindOptions({ select: selectOptions })
    .getMany()) as PartialObjectRecordWithId[];
};
