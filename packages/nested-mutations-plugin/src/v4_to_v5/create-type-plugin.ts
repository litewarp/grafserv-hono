import {EXPORTABLE} from 'graphile-build';
import {type GraphQLInputObjectType, isInputObjectType} from 'graphql';
import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsCreateTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsCreateTypesPlugin',
  description: 'Adds create types and fields for nested mutations',
  version: '0.0.1',

  schema: {
    hooks: {
      init(_init, build) {
        const {pgNestedMutationRelationships, pgNestedMutationInputTypes} = build;

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
                      const tableType = build.getGraphQLTypeByPgCodec(
                        rightTable.codec,
                        'input'
                      );
                      if (!isInputObjectType(tableType)) {
                        throw new Error(
                          `Expected ${rightTable.name} to be an input object type`
                        );
                      }

                      return Object.entries(tableType.getFields()).reduce(
                        (memo, [fieldName, attribute]) => {
                          return {
                            ...memo,
                            [fieldName]: fieldWithHooks({fieldName}, () => ({
                              ...attribute,
                              applyPlan: EXPORTABLE(
                                () =>
                                  function plan($parent, args) {
                                    $parent.set(fieldName, args.get());
                                  },
                                []
                              ),
                            })),
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
