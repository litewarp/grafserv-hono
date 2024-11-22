import type {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {pgInsertSingle} from '@dataplan/pg';
import {type ObjectStep, isObjectLikeStep} from 'postgraphile/grafast';
import type {PgCodecRelationWithName, PgTableResource} from '../../helpers.ts';

/**
 * Utilize the built-in @dataplan/pg steps to insert a forward relationship.
 */
export function pgRelationshipForwardInsertStep<
  TRelationship extends PgCodecRelationWithName,
>(
  build: GraphileBuild.Build,
  $item: ObjectStep,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  relationship: TRelationship
  // selections: [] = []
) {
  const {inflection, behavior} = build;
  const {remoteResource, remoteAttributes, localAttributes} = relationship;

  if (!isObjectLikeStep($item)) {
    throw new Error(`Expected input to be an object, but got ${typeof $item}`);
  }

  const insertableAttributes = Object.keys(remoteResource.codec.attributes).filter(
    (name) =>
      behavior.pgCodecAttributeMatches([remoteResource.codec, name], 'attribute:insert')
  );

  const primaryKey = (remoteResource as PgTableResource).uniques.find((u) => u.isPrimary);

  const $insert = pgInsertSingle(remoteResource);

  insertableAttributes.forEach((attributeName) => {
    if (!primaryKey?.attributes.includes(attributeName)) {
      const attribute = inflection.attribute({
        attributeName,
        codec: remoteResource.codec,
      });
      $insert.set(attributeName, $item.get(attribute));
    }
  });

  remoteAttributes.forEach((remote, idx) => {
    const local = localAttributes[idx];
    if (local) {
      $parent.set(local, $insert.get(remote));
    }
  });
  return $insert;
}
