import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsConnectTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsConnectTypesPlugin',
  description: 'Adds connect types and fields for nested mutations',
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

            const {connectByNodeId, connectByKeys} = mutationFields;

            // process connectByNodeId
            if (
              connectByNodeId &&
              !pgNestedMutationInputTypes.has(connectByNodeId.typeName)
            ) {
              pgNestedMutationInputTypes.add(connectByNodeId.typeName);
              const nodeIdField = inflection.nodeIdFieldName();

              // process connectByNodeId
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  connectByNodeId.typeName,
                  {
                    isNestedMutationConnectByNodeIdType: true,
                    isNestedMutationInputType: true,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The globally unique \`ID\` look up for the row to connect.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => ({
                      [nodeIdField]: fieldWithHooks({fieldName: nodeIdField}, () => ({
                        description: `The globally unique \`ID\` which identifies a single \`${rightTable.name}\` to be connected.`,
                        type: new GraphQLNonNull(GraphQLID),
                      })),
                    }),
                  }),
                  `Adding connect by nodeId input type for ${rightTable.name}`
                );
              });
            }

            // process connectByKeys
            if (connectByKeys) {
              for (const connectByKey of connectByKeys) {
                if (!pgNestedMutationInputTypes.has(connectByKey.typeName)) {
                  pgNestedMutationInputTypes.add(connectByKey.typeName);
                  // process connectByKey
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
