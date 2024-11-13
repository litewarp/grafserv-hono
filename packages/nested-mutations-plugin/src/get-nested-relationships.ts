import type {PgTableResource} from '@graphile-contrib/pg-many-to-many';
import type {
  PgNestedMutationRelationship,
  PgNestedTableMutationFields,
} from './interfaces.js';

export const pgNestedMutationFields = [
  'input',
  'create',
  'connectByKeys',
  'connectByNodeId',
] as const;

export function getNestedRelationships(
  leftTable: PgTableResource,
  build: GraphileBuild.Build
): PgNestedMutationRelationship[] {
  const {inflection} = build;

  return Object.entries(leftTable.getRelations()).reduce<
    PgNestedMutationRelationship[]
  >((memoLeft, [relationName, relationDetails]) => {
    const {
      localAttributes,
      remoteResource,
      isReferencee,
      remoteAttributes,
      isUnique,
    } = relationDetails;

    const rightTable: PgTableResource = remoteResource;
    const isReverse = isReferencee;

    const localUnique = leftTable.uniques.find((u) =>
      u.attributes.every((a) => localAttributes.includes(a))
    );

    const remoteUnique = rightTable.uniques.find((u) =>
      u.attributes.every((a) => remoteAttributes.includes(a))
    );

    const localCodecs = Object.entries(leftTable.codec.attributes).reduce(
      (memoCodec, [k, v]) =>
        localUnique?.attributes.includes(k)
          ? {...memoCodec, [k]: v}
          : memoCodec,
      {}
    );

    const remoteCodecs = Object.entries(rightTable.codec.attributes).reduce(
      (memoCodec, [k, v]) =>
        remoteUnique?.attributes.includes(k)
          ? {...memoCodec, [k]: v}
          : memoCodec,
      {}
    );

    const relationship: Omit<PgNestedMutationRelationship, 'mutationFields'> = {
      leftTable,
      rightTable,
      relationName,
      isUnique,
      localUnique: {
        ...localUnique,
        attributes: [...(localUnique?.attributes ?? [])],
        codecs: localCodecs,
      },
      remoteUnique: {
        ...remoteUnique,
        attributes: [...(remoteUnique?.attributes ?? [])],
        codecs: remoteCodecs,
      },
      isReverse,
      localAttributes,
      remoteAttributes,
      tableFieldName: inflection.tableFieldName(leftTable),
    };

    // todo - remove non-null assertion

    if (!build.getNodeIdHandler) {
      throw new Error('getNodeIdHandler not found on build');
    }

    const nodeIdHandler = build.getNodeIdHandler(
      inflection.tableType(rightTable.codec)
    );

    const mutationFields: PgNestedTableMutationFields = {
      /**
       * Type that gets added to the relation's input type
       */
      input: {
        fieldName: inflection.nestedConnectorFieldName(relationship),
        typeName: inflection.nestedConnectorFieldType(relationship),
      },

      /**
       * TYpe that
       */
      create: {
        fieldName: 'create',
        typeName: inflection.nestedCreateInputType(relationship),
      },

      // to do - perform check to see whether to add these fields
      connectByKeys: [
        {
          fieldName: inflection.nestedConnectByKeyFieldName(relationship),
          typeName: inflection.nestedConnectByKeyInputType(relationship),
        },
      ],
      ...(nodeIdHandler
        ? {
            connectByNodeId: {
              fieldName:
                inflection.nestedConnectByNodeIdFieldName(relationship),
              typeName: inflection.nestedConnectByNodeIdInputType(relationship),
            },
          }
        : {}),

      updateByKeys: [],
      ...(nodeIdHandler
        ? {
            updateByNodeId: {
              fieldName: inflection.nestedUpdateByNodeIdFieldName(relationship),
              typeName: inflection.nestedUpdateByNodeIdInputType(relationship),
            },
          }
        : {}),
    };

    return [
      ...memoLeft,
      {
        ...relationship,
        mutationFields,
      },
    ];
  }, []);
}
