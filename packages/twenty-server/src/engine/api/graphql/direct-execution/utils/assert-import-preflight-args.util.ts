import { isObject, isString } from 'class-validator';

import {
  GraphqlDirectExecutionException,
  GraphqlDirectExecutionExceptionCode,
} from 'src/engine/api/graphql/direct-execution/errors/graphql-direct-execution.exception';
import { STANDARD_ERROR_MESSAGE } from 'src/engine/api/common/common-query-runners/errors/standard-error-message.constant';
import { type ImportPreflightResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

export function assertImportPreflightArgs(
  args: unknown,
): asserts args is ImportPreflightResolverArgs {
  if (!isObject(args)) {
    throw new GraphqlDirectExecutionException(
      'Invalid argument: it must be an object',
      GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
      { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
    );
  }

  const allowedKeys = new Set(['data', 'rowIds', 'sourceStates']);

  for (const key of Object.keys(args)) {
    if (!allowedKeys.has(key)) {
      throw new GraphqlDirectExecutionException(
        `Argument not allowed: ${key}`,
        GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }
  }

  if (!('data' in args) || !Array.isArray(args.data)) {
    throw new GraphqlDirectExecutionException(
      'Missing required argument: "data" (array)',
      GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
      { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
    );
  }

  if (!args.data.every(isObject)) {
    throw new GraphqlDirectExecutionException(
      'Invalid argument: "data" must contain objects',
      GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
      { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
    );
  }

  if (!('rowIds' in args) || !Array.isArray(args.rowIds)) {
    throw new GraphqlDirectExecutionException(
      'Missing required argument: "rowIds" (array)',
      GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
      { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
    );
  }

  if (!args.rowIds.every(isString)) {
    throw new GraphqlDirectExecutionException(
      'Invalid argument: "rowIds" must contain strings',
      GraphqlDirectExecutionExceptionCode.INVALID_QUERY_INPUT,
      { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
    );
  }
}
