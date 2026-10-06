import { type Request } from 'express';
import { parse } from 'graphql';

import { DirectExecutionService } from 'src/engine/api/graphql/direct-execution/direct-execution.service';
import { buildResolverNameMap } from 'src/engine/api/graphql/direct-execution/utils/build-resolver-name-map.util';
import { RESOLVER_METHOD_NAMES } from 'src/engine/api/graphql/workspace-resolver-builder/constants/resolver-method-names';

describe('DirectExecutionService', () => {
  it('executes the company import preflight GraphQL field and returns JSON classifications', async () => {
    const preflightResults = [
      {
        rowId: 'row-new',
        status: 'NEW',
        matchedRecordIds: [],
        matchedConstraintIds: [],
        matchedConstraintNames: [],
        changedFieldNames: [],
        uncomparableFieldNames: [],
      },
      {
        rowId: 'row-exact',
        status: 'EXACT_EXISTING_MATCH',
        matchedRecordIds: ['record-exact'],
        matchedConstraintIds: ['unique-index'],
        matchedConstraintNames: ['emailUnique'],
        changedFieldNames: [],
        uncomparableFieldNames: [],
      },
      {
        rowId: 'row-changed',
        status: 'EXISTING_WITH_CHANGES',
        existingRecordId: 'record-changed',
        matchedRecordIds: ['record-changed'],
        matchedConstraintIds: ['unique-index'],
        matchedConstraintNames: ['emailUnique'],
        changedFieldNames: ['name'],
        uncomparableFieldNames: [],
      },
    ];
    const resolver = jest.fn().mockResolvedValue(preflightResults);
    const importPreflightResolverFactory = {
      create: jest.fn().mockReturnValue(resolver),
    };
    const flatObjectMetadata = {
      id: 'company-id',
      universalIdentifier: 'company-id',
      nameSingular: 'company',
      namePlural: 'companies',
      fieldIds: [],
    };
    const flatObjectMetadataMaps = {
      byUniversalIdentifier: { 'company-id': flatObjectMetadata },
    };
    const flatFieldMetadataMaps = {};
    const flatIndexMaps = {};
    const graphQLResolverNameMap = buildResolverNameMap([
      {
        universalIdentifier: 'company-id',
        nameSingular: 'company',
        namePlural: 'companies',
      },
    ]);
    expect(graphQLResolverNameMap.companyImportPreflight).toEqual({
      objectMetadataUniversalIdentifier: 'company-id',
      method: RESOLVER_METHOD_NAMES.IMPORT_PREFLIGHT,
      operationType: 'query',
    });
    const constructorArguments = Array.from({ length: 22 }, () => ({}));

    constructorArguments[1] = {
      getOrRecompute: jest.fn().mockResolvedValue({
        graphQLResolverNameMap,
        flatObjectMetadataMaps,
        flatFieldMetadataMapsOrm: flatFieldMetadataMaps,
        flatIndexMaps,
      }),
    };
    constructorArguments[3] = { get: () => undefined };
    constructorArguments[5] = {
      getMeter: () => ({
        createHistogram: () => ({ record: jest.fn() }),
      }),
    };
    constructorArguments[21] = importPreflightResolverFactory;

    const service = Reflect.construct(
      DirectExecutionService,
      constructorArguments,
    ) as DirectExecutionService;
    const query = parse(`
      query PreflightCompanyImport(
        $data: [CompanyCreateInput!]!
        $rowIds: [String!]!
      ) {
        companyImportPreflight(data: $data, rowIds: $rowIds)
      }
    `);
    const args = {
      data: [
        { name: 'New Company' },
        { name: 'Exact Company' },
        { name: 'Changed Company' },
      ],
      rowIds: ['row-new', 'row-exact', 'row-changed'],
    };
    const request = {
      workspace: { id: 'workspace-id' },
      body: {
        operationName: 'PreflightCompanyImport',
        variables: args,
      },
    } as unknown as Request;

    await expect(service.execute(request, query, false, true)).resolves.toEqual(
      { data: { companyImportPreflight: preflightResults } },
    );
    expect(importPreflightResolverFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ flatObjectMetadata }),
    );
    expect(resolver).toHaveBeenCalledWith(
      null,
      args,
      null,
      expect.objectContaining({ fieldNodes: expect.any(Array) }),
    );
  });
});
