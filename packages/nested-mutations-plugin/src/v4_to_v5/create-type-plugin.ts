import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsCreateTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsCreateTypesPlugin',
  description: 'Adds create types and fields for nested mutations',
  version: '0.0.1',

  schema: {
    hooks: {
      init(_init, build) {
        const {inflection, pgNestedMutationRelationships, pgNestedMutationInputTypes} =
          build;

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
            const {mutationFields, rightTable, isReverse} = relationship;

            const {create} = mutationFields;

            // process connectByNodeId
            if (create && !pgNestedMutationInputTypes.has(create.typeName)) {
              pgNestedMutationInputTypes.add(create.typeName);

              console.log(create.typeName);
              // process connectByNodeId
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  create.typeName,
                  {
                    isNestedMutationCreateInputType: true,
                    isNestedMutationInputType: true,
                    isNestedInverseMutation: isReverse,
                  },
                  () => ({
                    description: build.wrapDescription(
                      `The \`${rightTable.name}\` to be created by this mutation.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      return Object.entries(rightTable.codec.attributes).reduce(
                        (memo, [attributeName, attribute]) => {
                          const attributeType = build.getGraphQLTypeByPgCodec(
                            attribute.codec,
                            'input'
                          );
                          if (!attributeType) {
                            return memo;
                          }

                          const fieldName = inflection.attribute({
                            attributeName,
                            codec: rightTable.codec,
                          });

                          return {
                            ...memo,
                            [fieldName]: fieldWithHooks(
                              {fieldName, pgAttribute: attribute},
                              () => ({
                                description: attribute.description,
                                type: build.nullableIf(
                                  (!attribute.notNull &&
                                    !attribute.extensions?.tags?.notNull) ||
                                    attribute.hasDefault ||
                                    Boolean(attribute.extensions?.tags?.hasDefault),
                                  attributeType
                                ),
                              })
                            ),
                          };
                        },
                        {}
                      );
                    },
                  }),
                  `Adding create input type for ${rightTable.name}`
                );
              });
            }
          }
        }
        return _init;
      },
    },
  },
};
