import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsDeleteTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsDeleteTypesPlugin',
  description: 'Adds delete types and fields for nested mutations',
  version: '0.0.1',
  schema: {
    hooks: {
      init(_init, build) {
        const {
          inflection,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          graphql: {GraphQLID, GraphQLNonNull},
        } = build;

        for (const resource of Object.values(build.input.pgRegistry.pgResources)) {
          // only process resources that are tables
          if (!isPgTableResource(resource)) {
            continue;
          }

          // grab the relationship data from the build object
          const relationships = pgNestedMutationRelationships.get(resource.codec);

          if (!relationships) {
            continue;
          }
          for (const relationship of relationships) {
            const {mutationFields, rightTable} = relationship;

            const {deleteByNodeId, deleteByKeys} = mutationFields;

            // process deleteByNodeId
            if (
              deleteByNodeId &&
              !pgNestedMutationInputTypes.has(deleteByNodeId.typeName)
            ) {
              const nodeIdField = inflection.nodeIdFieldName();

              // process deleteByNodeId
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  deleteByNodeId.typeName,
                  {
                    isNestedMutationDeleteByNodeInputType: true,
                    isNestedMutationInputType: true,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The globally unique \`ID\` to be used in the deletion.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => ({
                      [nodeIdField]: fieldWithHooks({fieldName: nodeIdField}, () => ({
                        description: `The globally unique \`ID\` which identifies a single \`${rightTable.name}\` to be deleted.`,
                        type: new GraphQLNonNull(GraphQLID),
                      })),
                    }),
                  }),
                  `Adding delete by nodeId input type for ${rightTable.name}`
                );
              });
            }

            // process deleteByKeys
            if (deleteByKeys) {
              for (const deleteByKey of deleteByKeys) {
                if (!pgNestedMutationInputTypes.has(deleteByKey.typeName)) {
                  // process deleteByKey
                }
              }
            }
          }
        }
        return _init;
      },
    },
  },
};
