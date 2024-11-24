import {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {ObjectStep, __InputListStep, __InputObjectStep} from 'postgraphile/grafast';
import {type PgTableResource, isNestedMutableResource} from './helpers.ts';

export function allMutationsStep<TResource extends PgTableResource>(
  build: GraphileBuild.Build,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  $input: ObjectStep,
  resource: TResource
) {
  const {inflection, sql, grafast} = build;

  if (!($parent instanceof PgInsertSingleStep || $parent instanceof PgUpdateSingleStep)) {
    throw new Error(`$parent must be a PgInsertSingleStep or PgUpdateSingleStep`);
  }

  if (!($input instanceof ObjectStep)) {
    throw new Error(`$input must be an ObjectStep`);
  }

  const relationships = Object.entries(resource.getRelations())
    .filter(([_, r]) => isNestedMutableResource(build, r.remoteResource))
    .map(([relationName, details]) => ({...details, relationName}));

  function recurseForwardInputPlans(
    $parent: PgInsertSingleStep | PgUpdateSingleStep,
    $input: __InputObjectStep
  ) {
    const $output = grafast.object({});

    relationships.forEach((r) => {
      // only forward relationships
      if (r.isReferencee) return;

      // only if the input object has the relationship
      const fieldName = inflection.relationshipInputFieldName(r);

      if (!$input.evalHas(fieldName)) return;

      const $fieldValue = $input.get(fieldName);

      // assert ObjectType
      if (!($fieldValue instanceof __InputObjectStep)) {
        throw new Error(
          `Expected ${$fieldValue.constructor.name} to be of class __InputObjectStep`
        );
      }

      const updateByNodeIdName = inflection.relationshipUpdateByNodeIdFieldName(r);
      if ($fieldValue.evalHas(updateByNodeIdName)) {
        const $updateByNodeId = $fieldValue.get(updateByNodeIdName);
        if ($updateByNodeId instanceof __InputObjectStep) {
        } else if ($updateByNodeId instanceof __InputListStep) {
        } else {
          console.warn(
            `Expected ${$updateByNodeId.constructor.name} to be of class __InputObjectStep or __InputListStep`
          );
        }
      }
    });
  }
}
