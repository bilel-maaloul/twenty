import { Injectable } from '@nestjs/common';

import graphqlFields from 'graphql-fields';

import { CommonImportPreflightQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-import-preflight-query-runner/common-import-preflight-query-runner.service';
import { type WorkspaceResolverBuilderFactoryInterface } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolver-builder-factory.interface';
import {
  type ImportPreflightResolverArgs,
  type Resolver,
} from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { workspaceQueryRunnerGraphqlApiExceptionHandler } from 'src/engine/api/graphql/workspace-query-runner/utils/workspace-query-runner-graphql-api-exception-handler.util';
import { WorkspaceSchemaBuilderContext } from 'src/engine/api/graphql/workspace-schema-builder/interfaces/workspace-schema-builder-context.interface';
import { RESOLVER_METHOD_NAMES } from 'src/engine/api/graphql/workspace-resolver-builder/constants/resolver-method-names';
import { createQueryRunnerContext } from 'src/engine/api/graphql/workspace-resolver-builder/utils/create-query-runner-context.util';

@Injectable()
export class ImportPreflightResolverFactory implements WorkspaceResolverBuilderFactoryInterface {
  public static methodName = RESOLVER_METHOD_NAMES.IMPORT_PREFLIGHT;

  constructor(
    private readonly commonImportPreflightQueryRunnerService: CommonImportPreflightQueryRunnerService,
  ) {}

  create(
    context: WorkspaceSchemaBuilderContext,
  ): Resolver<ImportPreflightResolverArgs> {
    const internalContext = context;

    return async (_source, args, _requestContext, info) => {
      const selectedFields = graphqlFields(info);
      const resolverContext = createQueryRunnerContext({
        workspaceSchemaBuilderContext: internalContext,
      });

      try {
        const { results } =
          await this.commonImportPreflightQueryRunnerService.execute(
            { ...args, selectedFields },
            resolverContext,
          );

        return results;
      } catch (error) {
        workspaceQueryRunnerGraphqlApiExceptionHandler(error);
      }
    };
  }
}
