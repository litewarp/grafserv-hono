import type { PgResource } from '@dataplan/pg';
import { PgInsertSingleStep, PgUpdateSingleStep } from '@dataplan/pg';
import type { PgTableResource } from '@graphile-contrib/pg-many-to-many';
import type { ExecutableStep } from 'grafast';

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

export const isInsertable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  return build.behavior.pgResourceMatches(resource, 'resource:insert') === true;
};

export const isUpdatable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return Boolean(build.behavior.pgResourceMatches(resource, 'resource:update'));
};

export const isDeletable = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return Boolean(build.behavior.pgResourceMatches(resource, 'resource:delete'));
};

export const getCRUDBehavior = (
  build: GraphileBuild.Build,
  resource: PgResource<any, any, any, any, any>,
) => {
  if (resource.parameters) return {};
  if (!resource.codec.attributes) return {};
  if (resource.codec.polymorphism) return {};
  if (resource.codec.isAnonymous) return {};
  if (!resource.uniques || resource.uniques.length < 1) return {};

  return {
    insertable: isInsertable(build, resource),
    // connectable: isInsertable(build, resource), // TODO
    updatable: isUpdatable(build, resource),
    deletable: isDeletable(build, resource),
  };
};

export function isInsertOrUpdate(
  $step: ExecutableStep,
): $step is PgInsertSingleStep | PgUpdateSingleStep {
  return (
    $step instanceof PgInsertSingleStep || $step instanceof PgUpdateSingleStep
  );
}

export let inspect: (
  obj: any,
  options?: { colors?: boolean; depth?: number },
) => string;

try {
  inspect = require('node:util').inspect;
  if (typeof inspect !== 'function') {
    throw new Error('Failed to load inspect');
  }
} catch {
  inspect = (obj) => {
    return Array.isArray(obj) ||
      !obj ||
      Object.getPrototypeOf(obj) === null ||
      Object.getPrototypeOf(obj) === Object.prototype
      ? JSON.stringify(obj)
      : String(obj);
  };
}
