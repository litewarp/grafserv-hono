import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsInputTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsInputTypesPlugin',
  description: 'Adds input fields for nested mutations to the input types of the schema',
  version: '0.0.1',
  after: [
    'PgNestedMutationConnectTypesPlugin',
    'PgNestedMutationCreateTypesPlugin',
    'PgNestedMutationUpdateTypesPlugin',
    'PgNestedMutationDeleteTypesPlugin',
  ],

  schema: {
    hooks: {
      init(_init, build) {
        const {
          getGraphQLTypeNameByPgCodec,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          getInputTypeByName,
          graphql: {GraphQLList, GraphQLNonNull},
        } = build;

        const getInputType = (name: string, single?: boolean) => {
          const type = getInputTypeByName(name);
          return single ? type : new GraphQLList(new GraphQLNonNull(type));
        };

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
            const {mutationFields, leftTable, rightTable, isReverse, isUnique} =
              relationship;

            // check to make sure there are nested fields other than the input field
            const hasNestedFields =
              Object.keys(mutationFields).filter((k) => k !== 'input').length > 0;

            // if not, skip this relationship
            if (!hasNestedFields) {
              continue;
            }

            const {
              input,
              create,
              connectByKeys,
              connectByNodeId,
              updateByKeys,
              updateByNodeId,
              deleteByKeys,
              deleteByNodeId,
            } = mutationFields;

            // if we already have this input type, skip
            if (pgNestedMutationInputTypes.has(input.typeName)) {
              continue;
            }

            // add the input type to the set
            pgNestedMutationInputTypes.add(mutationFields.input.typeName);

            build.recoverable(null, () => {
              build.registerInputObjectType(
                input.typeName,
                {
                  isNestedMutationConnectorType: true,
                  isNestedInverseMutation: isReverse,
                  pgResource: leftTable,
                  pgNestedResource: rightTable,
                },
                () => ({
                  description: `Input for the nested mutation of ${leftTable.name} type`,
                  fields: ({fieldWithHooks}) => ({
                    ...(create
                      ? {
                          [create.fieldName]: fieldWithHooks(
                            {
                              fieldName: create.fieldName,
                              isNestedMutationInputType: true,
                              isNestedMutationCreateInputType: true,
                            },
                            {
                              description: `A ${getGraphQLTypeNameByPgCodec(rightTable.codec, 'input')} object that will be created and connected to this object`,
                              type: getInputType(create.typeName, !isReverse || isUnique),
                            }
                          ),
                        }
                      : {}),
                    ...(connectByKeys ? {} : {}),
                    ...(connectByNodeId
                      ? {
                          [connectByNodeId.fieldName]: fieldWithHooks(
                            {
                              fieldName: connectByNodeId.fieldName,
                              isNestedMutationConnectByNodeIdType: true,
                              isNestedMutationInputType: true,
                            },
                            {
                              description: `A ${rightTable.name} object that will be connected by its ID`,
                              type: getInputType(
                                connectByNodeId.typeName,
                                !isReverse || isUnique
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(updateByKeys ? {} : {}),
                    ...(updateByNodeId
                      ? {
                          [updateByNodeId.fieldName]: fieldWithHooks(
                            {
                              fieldName: updateByNodeId.fieldName,
                              isNestedMutationInputType: true,
                              isNestedMutationUpdateByNodeIdType: true,
                            },
                            {
                              description: `The primary keys and patch data for ${rightTable.name} for the far side of the relationship field`,
                              type: getInputType(
                                updateByNodeId.typeName,
                                !isReverse || isUnique
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(deleteByKeys ? {} : {}),
                    ...(deleteByNodeId ? {} : {}),
                  }),
                }),
                `PgNestedMutationsInputTypePlugin for nested mutations of ${rightTable.name} on a ${leftTable.name} resource`
              );
            });
          }
        }
        return _init;
      },
      GraphQLInputObjectType_fields(field, build, context) {
        const {
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          wrapDescription,
          getInputTypeByName,
          extend,
        } = build;

        const {
          fieldWithHooks,
          Self,
          scope: {isPgRowType, pgCodec},
        } = context;

        if (!isPgRowType || !pgCodec) {
          return field;
        }

        const relationships = pgNestedMutationRelationships.get(pgCodec);
        if (!relationships) {
          return field;
        }

        return extend(
          field,
          {
            ...Object.values(relationships).reduce((acc, relationship) => {
              const {fieldName, mutationFields, rightTable} = relationship;
              const type = getInputTypeByName(mutationFields.input.typeName);
              return {
                ...acc,
                [fieldName]: fieldWithHooks(
                  {
                    fieldName: mutationFields.input.fieldName,
                  },
                  {
                    description: wrapDescription(
                      `Nested mutation for ${rightTable.name}`,
                      'type'
                    ),
                    type,
                  }
                ),
              };
            }, {}),
          },
          `Adding nested mutation fields for ${Self.name}`
        );
      },

      GraphQLObjectType_fields_field(field, build, context) {
        const {extend, behavior} = build;
        const {
          fieldWithHooks,
          scope: {fieldName, fieldBehaviorScope, isRootMutation},
          Self,
        } = context;

        if (!isRootMutation) {
          return field;
        }
        // console.log(Self.name, field.type);

        // console.log(fieldName, fieldBehaviorScope, context.scope);
        return extend(
          field,
          {
            // plan($parent, args, info) {},
          },
          `Adding nested mutation plan for ${fieldName}`
        );
      },
    },
  },
};
