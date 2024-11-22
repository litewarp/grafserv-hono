import {PgInsertSingleStep, type PgResource, PgUpdateSingleStep} from '@dataplan/pg';
import type {} from 'graphile-build-pg';
import type {GraphQLInputField, GraphQLInputObjectType, GraphQLSchema} from 'graphql';
import {
  type FieldArgs,
  ListStep,
  ObjectStep,
  type SetterStep,
  type __InputObjectStep,
} from 'postgraphile/grafast';
import {
  type PgCodecRelationWithName,
  type PgTableResource,
  isDeletable,
  isInsertable,
  isNestedMutableResource,
  isPgTableResource,
  isUpdatable,
} from './helpers.ts';
import {pgRelationshipForwardConnectByNodeIdStep} from './steps/forward-connect-by-id.ts';
import {pgRelationshipForwardInsertStep} from './steps/forward-insert.ts';
import {pgRelationshipReverseConnectByNodeIdStep} from './steps/reverse-connect-by-id.ts';
import {pgRelationshipReverseInsertStep} from './steps/reverse-insert.ts';

interface ResourceRelationshipMutationFields {
  insertable?: {name: string; type: string};
  connectable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
  updateable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
  deletable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
}

/**
 * Determine the root mutation input fields on the localResource to apply the args to
 * e.g., createParent => ['input', 'parent', 'childrenByTheirDadParentId'], ['input', 'parent', 'childrenByTheirMomParentId']
 */
const mapPgRelationshipRootFields = <
  TFieldName extends string = string,
  TResource extends PgResource = PgResource,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  connectorFieldNames: string[]
): Record<TFieldName, string[][]> => {
  const fieldNames: string[] = [];
  const paths: string[][] = [];
  const isLocalResourceInsertable = isInsertable(build, resource);
  // const isLocalResourceUpdatable = isUpdatable(build, resource);

  if (isLocalResourceInsertable) {
    fieldNames.push(build.inflection.createField(resource));
    paths.push(['input', build.inflection.tableFieldName(resource)]);
  }
  // if (isLocalResourceUpdatable) {
  //   fieldNames.push(
  //     build.inflection.patchField(build.inflection.tableFieldName(resource))
  //   );
  //   paths.push(['input', 'patch']);
  // }

  const allPaths = connectorFieldNames.reduce((memo, connectorFieldName) => {
    return [...memo, ...paths.map((path) => [...path, connectorFieldName])];
  }, [] as string[][]);

  return fieldNames.reduce(
    (memo, fieldName) => {
      return {
        ...memo,
        [fieldName]: allPaths,
      };
    },
    {} as Record<TFieldName, string[][]>
  );
};

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRelationshipConnectorFields: Map<
        string,
        {fieldName: string; typeName: string; relationName: string}
      >;
    }
    interface Inflection {
      relationshipConnectFieldName(
        this: Inflection,
        relationship: PgCodecRelationWithName & {mode: 'node' | 'key'}
      ): string;
      relationshipConnectInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName & {mode: 'node' | 'key'}
      ): string;
      relationshipCreateFieldName(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipCreateInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipDeleteFieldName(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipDeleteInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipInputFieldName(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipUpdateFieldName(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
      relationshipUpdateInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName
      ): string;
    }
    interface ScopeInputObject {
      relationName?: string;
      isRelationshipCreateInputType?: boolean;
      isRelationshipInputType?: boolean;
      isRelationshipNodeIdConnectInputType?: boolean;
      isRelationshipKeysConnectInputType?: boolean;
      isRelationshipInverse?: boolean;
      remoteResource?: PgTableResource;
    }
    interface ScopeInputObjectFieldsField {
      isRelationshipCreateInputField?: boolean;
      isRelationshipConnectorField?: boolean;
      isRelationshipNodeIdConnectField?: boolean;
      isRelationshipKeysConnectField?: boolean;
    }
  }
}

export const PgNestedMutationsInitSchemaPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsInitSchemaPlugin',
  description: 'Gathers the context data for the nested mutations plugin',
  version: '0.0.1',
  after: ['PgRelationsPlugin'],

  inflection: {
    add: {
      relationshipConnectFieldName(_options, {mode, remoteAttributes}) {
        return mode === 'node'
          ? this.camelCase(`connect-by-node-id`)
          : this.camelCase(`connect-by-${remoteAttributes.join('-and-')}`);
      },
      relationshipConnectInputType(_options, {mode, relationName, remoteAttributes}) {
        return mode === 'node'
          ? this.upperCamelCase(`${relationName}-connect-by-node-id-input`)
          : this.upperCamelCase(
              `${relationName}-connect-by-${remoteAttributes.join('-and-')}-input`
            );
      },
      relationshipCreateFieldName(_options, _relationship) {
        return this.camelCase(`create`);
      },
      relationshipCreateInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-create-input`);
      },
      relationshipInputFieldName(_options, {relationName}) {
        return relationName;
      },
      relationshipInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}Input`);
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        /**
         * Instantiate the context properties on the build object
         */
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRelationshipConnectorFields = new Map();

        return build;
      },

      init(_, build) {
        const {
          inflection,
          graphql: {GraphQLList, GraphQLNonNull, GraphQLID},
          wrapDescription,
          EXPORTABLE,
        } = build;

        const relationshipInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        tableResources.forEach((resource) => {
          const relationships = Object.entries(resource.getRelations())
            .filter(([_, r]) => isNestedMutableResource(build, r.remoteResource))
            .map(([relationName, details]) => ({...details, relationName}));

          relationships.forEach((relationship) => {
            const {isReferencee, isUnique, remoteResource, relationName} = relationship;

            const relationshipTypeName = inflection.relationshipInputType(relationship);

            if (relationshipInputTypes.has(relationshipTypeName)) {
              console.log(`Skipping ${relationshipTypeName}: already exists`);
              return;
            }
            relationshipInputTypes.add(relationshipTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);
            // TODO: Move out of insertable conditional once behaviors are implemented
            // for now, if you're insertable, you are connectable
            const connectable = insertable;

            const fields: ResourceRelationshipMutationFields = {
              connectable: {},
              deletable: {},
              updateable: {},
            };

            if (insertable) {
              const createFieldName =
                inflection.relationshipCreateFieldName(relationship);
              const createTypeName = inflection.relationshipCreateInputType(relationship);

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  createTypeName,
                  {
                    isRelationshipCreateInputType: true,
                    remoteResource,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `The ${inflection.tableType(remoteResource.codec)} to be created by this mutation.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      const TableType = build.getGraphQLTypeByPgCodec(
                        remoteResource.codec,
                        'input'
                      );
                      return {
                        ...Object.entries(
                          (TableType as GraphQLInputObjectType).getFields()
                        ).reduce((memo, [fieldName, attribute]) => {
                          return {
                            ...memo,
                            [fieldName]: fieldWithHooks(
                              {fieldName},
                              {
                                ...attribute,
                                // applyPlan
                              }
                            ),
                          };
                        }, Object.create(null)),
                      };
                    },
                  }),
                  `Add a relationship create input type for ${remoteResource.name} on ${relationName}`
                );
                fields.insertable = {name: createFieldName, type: createTypeName};
              });
            }

            if (connectable) {
              // TODO: ADD TO BEHAVIORS
              // CONNECT BY NODE ID
              const connectByIdName = inflection.relationshipConnectFieldName({
                ...relationship,
                mode: 'node',
              });
              const connectByIdTypeName = inflection.relationshipConnectInputType({
                ...relationship,
                mode: 'node',
              });

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  connectByIdTypeName,
                  {
                    isRelationshipNodeIdConnectInputType: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `Relationship connect by node id for ${relationName}`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      return {
                        [inflection.nodeIdFieldName()]: fieldWithHooks(
                          {fieldName: inflection.nodeIdFieldName()},
                          () => ({
                            description: wrapDescription(
                              `The node id input field to connect ${remoteResource.name} in the ${relationName} relationship`,
                              'field'
                            ),
                            type: new GraphQLNonNull(GraphQLID),
                          })
                        ),
                      };
                    },
                  }),
                  `Creating relationship connect by node id input type for ${relationName}`
                );
                fields.connectable.byNodeId = {
                  name: connectByIdName,
                  type: connectByIdTypeName,
                };
              });

              // TODO: ADD TO BEHAVIORS
              // CONNECT BY KEYS
              // const connectByKeysName = inflection.relationshipConnectFieldName({
              //   ...relationship,
              //   mode: 'key',
              // });
              const connectByKeysType = inflection.relationshipConnectInputType({
                ...relationship,
                mode: 'key',
              });

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  connectByKeysType,
                  {},
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `Relationship connect by keys for ${relationName}`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      return relationship.remoteAttributes.reduce(
                        (memo, attributeName) => {
                          const attribute =
                            remoteResource.codec.attributes[attributeName];

                          const AttributeType = attribute
                            ? build.getGraphQLTypeByPgCodec(attribute.codec, 'input')
                            : null;

                          if (attribute && AttributeType) {
                            return {
                              ...memo,
                              [attributeName]: fieldWithHooks(
                                {fieldName: attributeName},
                                () => ({
                                  description: wrapDescription(
                                    `The ${attributeName} input field to connect ${remoteResource.name} in the ${relationName} relationship`,
                                    'field'
                                  ),
                                  type: new GraphQLNonNull(AttributeType),
                                  applyPlan: EXPORTABLE(
                                    (attributeName) =>
                                      function plan($insert, val) {
                                        $insert.set(attributeName, val.get());
                                      },
                                    [attributeName]
                                  ),
                                  autoApplyAfterParentApplyPlan: true,
                                })
                              ),
                            };
                          }
                          return memo;
                        },
                        {}
                      );
                    },
                  }),
                  `Creating relationship connect by keys input type for ${relationName}`
                );
              });
              fields.connectable.byKeys = {
                name: connectByIdName,
                type: connectByIdTypeName,
              };
            }

            if (updateable) {
            }

            if (deletable) {
            }

            build.recoverable(null, () => {
              build.registerInputObjectType(
                relationshipTypeName,
                {
                  relationName: relationName,
                  isRelationshipInputType: true,
                  isRelationshipInverse: isReferencee,
                  remoteResource: remoteResource,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: wrapDescription(
                    `Relationship input type for ${relationName}`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => ({
                    ...(fields.insertable
                      ? {
                          [fields.insertable.name]: fieldWithHooks(
                            {
                              fieldName: fields.insertable.name,
                              isRelationshipCreateInputField: true,
                              remoteResource,
                            },
                            {
                              type:
                                isUnique || !isReferencee
                                  ? build.getInputTypeByName(fields.insertable.type)
                                  : new GraphQLList(
                                      new GraphQLNonNull(
                                        build.getInputTypeByName(fields.insertable.type)
                                      )
                                    ),
                              description: wrapDescription(
                                `A ${inflection.tableType(remoteResource.codec)} created and linked to this object`,
                                'type'
                              ),
                              applyPlan: EXPORTABLE(
                                (
                                  isUnique,
                                  isReferencee,
                                  pgRelationshipForwardInsertStep,
                                  pgRelationshipReverseInsertStep
                                ) =>
                                  function plan(
                                    $parent: PgInsertSingleStep | PgUpdateSingleStep,
                                    args: FieldArgs,
                                    _info: {
                                      schema: GraphQLSchema;
                                      entity: GraphQLInputField;
                                    }
                                  ) {
                                    if (isUnique || !isReferencee) {
                                      pgRelationshipForwardInsertStep(
                                        build,
                                        args.get() as ObjectStep,
                                        $parent,
                                        relationship
                                      );
                                    } else {
                                      pgRelationshipReverseInsertStep(
                                        build,
                                        args.get() as ListStep<__InputObjectStep[]>,
                                        $parent,
                                        relationship
                                      );
                                    }
                                  },
                                [
                                  isUnique,
                                  isReferencee,
                                  pgRelationshipForwardInsertStep,
                                  pgRelationshipReverseInsertStep,
                                ]
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connectable.byNodeId
                      ? {
                          [fields.connectable.byNodeId.name]: fieldWithHooks(
                            {
                              fieldName: fields.connectable.byNodeId.name,
                              remoteResource,
                              isRelationshipNodeIdConnectField: true,
                            },
                            {
                              description: wrapDescription(
                                `Connect ${relationName} by node id`,
                                'field'
                              ),
                              type:
                                isUnique || !isReferencee
                                  ? build.getInputTypeByName(
                                      fields.connectable.byNodeId.type
                                    )
                                  : new GraphQLList(
                                      new GraphQLNonNull(
                                        build.getInputTypeByName(
                                          fields.connectable.byNodeId.type
                                        )
                                      )
                                    ),
                              applyPlan: EXPORTABLE(
                                (
                                  isUnique,
                                  isReferencee,
                                  pgRelationshipForwardConnectByNodeIdStep,
                                  pgRelationshipReverseConnectByNodeIdStep
                                ) =>
                                  function plan(
                                    $object: PgUpdateSingleStep | PgInsertSingleStep,
                                    args: FieldArgs
                                  ) {
                                    const handler =
                                      build.getNodeIdHandler &&
                                      build.getNodeIdHandler(
                                        inflection.tableType(remoteResource.codec)
                                      );
                                    if (!handler) {
                                      throw new Error(
                                        `Could not find node handler for ${inflection.tableType(remoteResource.codec)}`
                                      );
                                    }
                                    if (isUnique || !isReferencee) {
                                      pgRelationshipForwardConnectByNodeIdStep(
                                        build,
                                        handler,
                                        args.get() as ObjectStep,
                                        $object,
                                        relationship
                                      );
                                    } else {
                                      pgRelationshipReverseConnectByNodeIdStep(
                                        build,
                                        handler,
                                        args.get() as ListStep<__InputObjectStep[]>,
                                        $object,
                                        relationship
                                      );
                                    }
                                  },
                                [
                                  isUnique,
                                  isReferencee,
                                  pgRelationshipForwardConnectByNodeIdStep,
                                  pgRelationshipReverseConnectByNodeIdStep,
                                ]
                              ),
                              autoApplyAfterParentApplyPlan: true,
                            }
                          ),
                        }
                      : {}),
                  }),
                }),
                `Creating input type for relationship ${relationName}`
              );
            });
          });
        });
        return _;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {inflection, wrapDescription, EXPORTABLE} = build;
        const {
          fieldWithHooks,
          scope: {isPgRowType, pgCodec, isInputType, isPgPatch},
        } = context;

        if (isPgRowType && pgCodec && (isInputType || isPgPatch)) {
          const resource = build.input.pgRegistry.pgResources[pgCodec.name];
          if (resource) {
            const relationships = Object.entries(resource.getRelations())
              .filter(([_, r]) => isNestedMutableResource(build, r.remoteResource))
              .map(([relationName, details]) => ({...details, relationName}));

            const connectorFields = relationships.reduce((memo, relationship) => {
              const fieldName = inflection.relationshipInputFieldName(relationship);
              const typeName = inflection.relationshipInputType(relationship);
              const InputType = build.getInputTypeByName(typeName);
              return {
                ...memo,
                [fieldName]: fieldWithHooks(
                  {
                    fieldName,
                    isRelationshipConnectorField: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `Nested connector type for ${relationship.relationName}`,
                      'field'
                    ),
                    type: InputType,
                    autoApplyAfterParentApplyPlan: true,
                    applyPlan: EXPORTABLE(
                      () =>
                        function plan($object: SetterStep, args: FieldArgs) {
                          if (
                            $object instanceof PgInsertSingleStep ||
                            $object instanceof PgUpdateSingleStep
                          ) {
                            args.apply($object);
                          }
                        },
                      []
                    ),
                  })
                ),
              };
            }, Object.create(null));

            const rootFields = mapPgRelationshipRootFields(
              build,
              resource,
              Object.keys(connectorFields)
            );

            Object.entries(rootFields).forEach(([fieldName, paths]) => {
              build.pgRelationshipMutationRootFields.set(fieldName, paths);
            });

            return build.extend(
              fields,
              connectorFields,
              `Adding nested relationships to ${pgCodec.name}`
            );
          }
        }
        return fields;
      },
      GraphQLObjectType_fields_field(field, build, context) {
        const {EXPORTABLE, pgRelationshipMutationRootFields} = build;
        const {
          scope: {isRootMutation, fieldName},
        } = context;

        if (isRootMutation) {
          const rootFields = pgRelationshipMutationRootFields.get(fieldName);
          return {
            ...field,
            plan: EXPORTABLE(
              () =>
                function plan($parent, fieldArgs, info) {
                  if (!field.plan) {
                    return $parent;
                  }
                  const $resolved = field.plan($parent, fieldArgs, info);

                  const $result = $resolved.get('result');
                  // apply field args to all connector fields in the relationship mutation input
                  if (!rootFields) {
                    return $resolved;
                  }
                  rootFields.forEach((path) => {
                    fieldArgs.apply($result, path);
                  });
                  return $resolved;
                },
              []
            ),
          };
        }

        return field;
      },
    },
  },
};
