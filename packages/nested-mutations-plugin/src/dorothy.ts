import {
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';
import {
  type ExecutableStep,
  FieldArgs,
  type FieldInfo,
  type InputObjectFieldApplyPlanResolver,
  type ModifierStep,
  __InputListStep,
  __InputObjectStep,
} from 'postgraphile/grafast';
import type {PgRelationshipMutationsRelationshipData} from './relationships.ts';

export const getNestedCreatePlanResolver = (
  build: GraphileBuild.Build,
  relationship: PgRelationshipMutationsRelationshipData
): InputObjectFieldApplyPlanResolver<
  any,
  void | ModifierStep<ExecutableStep<any> | ModifierStep<any>> | null
> => {
  const {
    behavior: {pgCodecAttributeMatches},
    inflection,
  } = build;

  const {remoteResource, localAttributes, remoteAttributes} = relationship;

  const remoteUniq = remoteResource.uniques.find((u) => u.isPrimary);
  const relFieldNames = (build.pgRelationshipInputTypes[remoteResource.name] ?? []).map(
    (r) => r.fieldName
  );

  const prepareAttrs = ($object: __InputObjectStep) => {
    return Object.keys(remoteResource.codec.attributes).reduce((memo, name) => {
      const isInsertable = pgCodecAttributeMatches(
        [remoteResource.codec, name],
        'attribute:insert'
      );
      const isPrimaryKey = remoteUniq?.attributes.find(
        (a) => a === name && remoteResource.codec.attributes[a]?.hasDefault
      );

      if (!isInsertable) return memo;

      if (isPrimaryKey) {
        return memo;
      }

      return {
        ...memo,
        [name]: $object.get(
          inflection.attribute({attributeName: name, codec: remoteResource.codec})
        ),
      };
    }, Object.create(null));
  };

  const resolver = (
    $object: PgInsertSingleStep | PgUpdateSingleStep,
    args: FieldArgs,
    _info?: FieldInfo
  ) => {
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      // build item
      const $item = pgInsertSingle(remoteResource, prepareAttrs($rawArgs));
      // set foreign keys on parent object
      localAttributes.forEach((local, i) => {
        const remote = remoteAttributes[i];
        if (remote) {
          $object.set(local.name, $item.get(remote.name));
        }
      });
      relFieldNames.forEach((field) => args.apply($item, [field]));
    } else if ($rawArgs instanceof __InputListStep) {
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);

        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }
        const attrs = remoteAttributes.reduce((memo, remote, idx) => {
          const local = localAttributes[idx];
          if (remote && local) {
            return {...memo, [remote.name]: $object.get(local.name)};
          }
          return memo;
        }, prepareAttrs($rawArg));

        const $item = pgInsertSingle(remoteResource, attrs);
        relFieldNames.forEach((field) => args.apply($item, [i, field]));
      }
      return $object;
    } else {
      console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
    }
  };

  return resolver;
};
