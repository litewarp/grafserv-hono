import {memo} from 'postgraphile/grafserv';
import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsUpdateTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsUpdateTypesPlugin',
  description: 'Adds update types and fields for nested mutations',
  version: '0.0.1',
  schema: {
    hooks: {
      init(_init, build) {
        const {
          inflection,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          graphql: {GraphQLID, GraphQLNonNull, GraphQLInputObjectType, isInputObjectType},
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

            const {updateByNodeId, updateByKeys} = mutationFields;

            // process connectByNodeId
            if (
              updateByNodeId &&
              !pgNestedMutationInputTypes.has(updateByNodeId.typeName)
            ) {
              pgNestedMutationInputTypes.add(updateByNodeId.typeName);
              const nodeIdField = inflection.nodeIdFieldName();

              // process connectByNodeId
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  updateByNodeId.typeName,
                  {
                    isNestedMutationUpdateByNodeIdType: true,
                    isNestedMutationInputType: true,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The globally unique \`ID\` to be used in the connection.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => ({
                      [nodeIdField]: fieldWithHooks({fieldName: nodeIdField}, () => ({
                        description: `The globally unique \`ID\` which identifies a single \`${rightTable.name}\` to be updated.`,
                        type: new GraphQLNonNull(GraphQLID),
                      })),
                      patch: fieldWithHooks(
                        {fieldName: 'patch', pgResource: rightTable},
                        () => {
                          const tablePatchType = build.getGraphQLTypeByPgCodec(
                            rightTable.codec,
                            'patch'
                          );
                          if (!isInputObjectType(tablePatchType)) {
                            throw new Error(
                              `Expected ${rightTable.name} to be an input object type`
                            );
                          }
                          const fields = tablePatchType.getFields();
                          return {
                            type: new GraphQLInputObjectType({
                              name: inflection.nestedUpdatePatchType(relationship),
                              fields: {...fields},
                            }),
                          };
                        }
                      ),
                    }),
                  }),
                  `Adding update by nodeId input type for ${rightTable.name}`
                );
              });
            }

            // process updateByKeys
            if (updateByKeys) {
              for (const updateByKey of updateByKeys) {
                if (!pgNestedMutationInputTypes.has(updateByKey.typeName)) {
                  pgNestedMutationInputTypes.add(updateByKey.typeName);
                  // process updateByKeys
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
