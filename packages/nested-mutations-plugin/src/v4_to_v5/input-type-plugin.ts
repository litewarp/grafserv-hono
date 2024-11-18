import {
  type PgDeleteSingleStep,
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';
import {EXPORTABLE} from 'graphile-build';
import {
  type ExecutableStep,
  type FieldArgs,
  type FieldInfo,
  type ModifierStep,
  ObjectStep,
  type SetterStep,
  __InputObjectStep,
  type __InputObjectStepWithDollars,
  __TrackedValueStep,
  condition,
} from 'postgraphile/grafast';
import {isPgTableResource} from '../helpers.ts';
import {pgNestedMutationFields} from './get-nested-relationships.ts';

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
          inflection,
          getGraphQLTypeNameByPgCodec,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          pgNestedMutationInputObjMap,
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
            const {
              mutationFields,
              leftTable,
              rightTable,
              isReverse,
              isUnique,
              tableFieldName,
              localUnique,
            } = relationship;

            // store the fieldNames on which to add the connector type
            pgNestedMutationInputObjMap
              .set(inflection.createField(leftTable), leftTable.codec)
              .set(
                inflection.updateNodeField({resource: leftTable, unique: localUnique}),
                leftTable.codec
              );

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
            pgNestedMutationInputTypes.add(input.typeName);

            build.recoverable(null, () => {
              build.registerInputObjectType(
                input.typeName,
                {
                  isNestedMutationConnectorType: true,
                  isNestedInverseMutation: isReverse,
                  pgResource: leftTable,
                },
                () => ({
                  description: build.wrapDescription(
                    `Input for the nested mutation of ${rightTable.name} in the ${build.getGraphQLTypeNameByPgCodec(leftTable.codec, 'input')} mutation.`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => ({
                    ...(create
                      ? {
                          [create.fieldName]: fieldWithHooks(
                            {
                              fieldName: create.fieldName,
                              isNestedMutationInputType: true,
                              isNestedMutationCreateInputType: true,
                              pgResource: leftTable,
                            },
                            {
                              description: `A ${getGraphQLTypeNameByPgCodec(rightTable.codec, 'input')} object that will be created and connected to this object`,
                              type: getInputType(create.typeName, !isReverse || isUnique),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                () =>
                                  function plan($object, args, info) {
                                    // will be ListStep or ObjectStep
                                    // based on whether the relationship is unique and reverse
                                    const raw = args.getRaw();
                                    if (!isReverse || isUnique) {
                                      // single
                                    } else {
                                      const obj = Object.entries(
                                        rightTable.codec.attributes
                                      ).reduce((memo, [attrName, attr]) => {
                                        // todo: LIMIT TO ONLY THE ATTRIBUTES THAT ARE IN THE INPUT
                                        const attributeName = inflection.attribute({
                                          attributeName: attrName,
                                          codec: rightTable.codec,
                                        });
                                        return {
                                          ...memo,
                                          [attrName]: args.get(attributeName),
                                        };
                                      }, {});
                                      // list
                                      const $insert = pgInsertSingle(rightTable, obj);
                                      console.log($insert);
                                    }
                                  },
                                []
                              ),
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
                              pgResource: leftTable,
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
                              pgResource: leftTable,
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
      GraphQLInputObjectType_fields(fields, build, context) {
        const {
          pgNestedMutationRelationships,
          wrapDescription,
          getInputTypeByName,
          extend,
          EXPORTABLE,
        } = build;

        const {
          fieldWithHooks,
          Self,
          scope: {isPgRowType, pgCodec, isPgPatch, isInputType},
        } = context;

        // if (isNestedMutationConnectorType) {
        //   console.log(
        //     'nested mutation connector type',
        //     Self.name,
        //     Object.keys(context.scope)
        //   );
        // }

        if ((!isPgPatch && (!isInputType || !isPgRowType)) || !pgCodec) {
          return fields;
        }

        const relationships = pgNestedMutationRelationships.get(pgCodec);
        if (!relationships) {
          return fields;
        }

        return extend(
          fields,
          {
            ...Object.values(relationships).reduce((acc, relationship) => {
              const {
                fieldName,
                mutationFields: {input},
                rightTable,
              } = relationship;
              const type = getInputTypeByName(input.typeName);
              return {
                ...acc,
                [fieldName]: fieldWithHooks(
                  {fieldName},
                  {
                    description: wrapDescription(
                      `Nested mutation for ${rightTable.name}`,
                      'type'
                    ),
                    type,
                    autoApplyAfterParentApplyPlan: true,
                    applyPlan: EXPORTABLE(
                      () =>
                        function plan($object, args) {
                          args.apply($object);
                        },
                      []
                    ),
                  }
                ),
              };
            }, {}),
          },
          `Adding nested mutation fields for ${Self.name}`
        );
      },
      GraphQLObjectType_fields_field: (field, build, context) => {
        const {pgNestedMutationInputObjMap, pgNestedMutationRelationships} = build;
        const {
          scope: {isRootMutation, fieldName, fieldBehaviorScope},
          Self,
        } = context;

        const codec = pgNestedMutationInputObjMap.get(fieldName);
        if (isRootMutation && codec) {
          const relationships = pgNestedMutationRelationships.get(codec);

          if (!relationships?.[0]) {
            return field;
          }

          const {mutationFields, tableFieldName} = relationships[0];

          return {
            ...field,
            plan($parent: __TrackedValueStep, args, info) {
              if (!field.plan) {
                return;
              }

              const $parentPlan: ObjectStep<{
                result: PgInsertSingleStep | PgUpdateSingleStep | PgDeleteSingleStep;
              }> = field.plan($parent, args, info);

              return $parentPlan;
            },
          };
        }

        return field;
      },
    },
  },
};
