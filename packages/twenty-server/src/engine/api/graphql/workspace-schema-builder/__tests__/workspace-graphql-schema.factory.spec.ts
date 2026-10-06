import { parse, validate } from 'graphql';
import { FieldMetadataType } from 'twenty-shared/types';

import { WorkspaceResolverBuilderService } from 'src/engine/api/graphql/workspace-resolver-builder/workspace-resolver-builder.service';
import { GqlTypeGenerator } from 'src/engine/api/graphql/workspace-schema-builder/graphql-type-generators/gql-type.generator';
import { TypeMapperService } from 'src/engine/api/graphql/workspace-schema-builder/services/type-mapper.service';
import { WorkspaceGraphQLSchemaGenerator } from 'src/engine/api/graphql/workspace-schema-builder/workspace-graphql-schema.factory';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

describe('WorkspaceGraphQLSchemaGenerator', () => {
  it('generates and validates a preflight query using create-many input conventions', async () => {
    const companyObject = {
      id: 'company-id',
      universalIdentifier: 'company-universal-id',
      nameSingular: 'company',
      namePlural: 'companies',
      fieldIds: ['company-id-field-id', 'company-name-field-id'],
      indexMetadataIds: [],
    } as FlatObjectMetadata;
    const companyIdField = {
      id: 'company-id-field-id',
      universalIdentifier: 'company-id-field-universal-id',
      objectMetadataId: companyObject.id,
      name: 'id',
      type: FieldMetadataType.UUID,
      isNullable: false,
      settings: {},
    } as FlatFieldMetadata;
    const companyNameField = {
      id: 'company-name-field-id',
      universalIdentifier: 'company-name-field-universal-id',
      objectMetadataId: companyObject.id,
      name: 'name',
      type: FieldMetadataType.TEXT,
      isNullable: true,
      settings: {},
    } as FlatFieldMetadata;
    const flatObjectMetadataMaps = {
      byUniversalIdentifier: {
        [companyObject.universalIdentifier]: companyObject,
      },
      idByUniversalIdentifier: {
        [companyObject.universalIdentifier]: companyObject.id,
      },
      universalIdentifierById: {
        [companyObject.id]: companyObject.universalIdentifier,
      },
      universalIdentifiersByApplicationId: {},
    } as FlatEntityMaps<FlatObjectMetadata>;
    const flatFieldMetadataMaps = {
      byUniversalIdentifier: {
        [companyIdField.universalIdentifier]: companyIdField,
        [companyNameField.universalIdentifier]: companyNameField,
      },
      idByUniversalIdentifier: {
        [companyIdField.universalIdentifier]: companyIdField.id,
        [companyNameField.universalIdentifier]: companyNameField.id,
      },
      universalIdentifierById: {
        [companyIdField.id]: companyIdField.universalIdentifier,
        [companyNameField.id]: companyNameField.universalIdentifier,
      },
      universalIdentifiersByApplicationId: {},
    } as FlatEntityMaps<FlatFieldMetadata>;
    const shouldBuildResolver = jest.fn().mockReturnValue(true);
    const gqlTypeGenerator = new GqlTypeGenerator(new TypeMapperService(), {
      shouldBuildResolver,
    } as unknown as WorkspaceResolverBuilderService);
    const schemaGenerator = new WorkspaceGraphQLSchemaGenerator(
      gqlTypeGenerator,
    );

    const schema = await schemaGenerator.generateSchema({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps: {} as FlatEntityMaps<never>,
    });
    const query = parse(`
      query PreflightCompanyImport(
        $data: [CompanyCreateInput!]!
        $rowIds: [String!]!
      ) {
        companyImportPreflight(data: $data, rowIds: $rowIds)
      }
    `);

    expect(schema.getType('CompanyCreateInput')).toBeDefined();
    expect(
      schema.getQueryType()?.getFields().companyImportPreflight,
    ).toBeDefined();
    expect(validate(schema, query)).toEqual([]);
    expect(shouldBuildResolver).toHaveBeenCalledWith(
      companyObject,
      'importPreflight',
    );
  });
});
