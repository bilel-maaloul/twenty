import { isObject } from '@sniptt/guards';
import { ObjectRecord } from 'twenty-shared/types';

import { IConnection } from 'src/engine/api/graphql/workspace-query-runner/interfaces/connection.interface';
import { IEdge } from 'src/engine/api/graphql/workspace-query-runner/interfaces/edge.interface';
import { IGroupByConnection } from 'src/engine/api/graphql/workspace-query-runner/interfaces/group-by-connection.interface';

export const isObjectRecord = (result: unknown): result is ObjectRecord => {
  return !Array.isArray(result) && isObject(result) && 'id' in result;
};

export const isObjectRecordArray = (
  result: unknown,
): result is ObjectRecord[] => {
  return Array.isArray(result) && result.every((item) => isObjectRecord(item));
};

export const isConnection = (
  result: unknown,
): result is IConnection<ObjectRecord, IEdge<ObjectRecord>> => {
  return isObject(result) && 'edges' in result && 'pageInfo' in result;
};

export const isConnectionArray = (
  result: unknown,
): result is IConnection<ObjectRecord, IEdge<ObjectRecord>>[] => {
  return Array.isArray(result) && result.every((item) => isConnection(item));
};

export const isGroupByConnection = (
  result: unknown,
): result is IGroupByConnection<ObjectRecord, IEdge<ObjectRecord>> => {
  return isConnection(result) && 'groupByDimensionValues' in result;
};
