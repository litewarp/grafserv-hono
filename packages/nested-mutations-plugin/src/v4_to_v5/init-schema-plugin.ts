import type {PgResource} from '@dataplan/pg';
import type {} from 'graphile-build-pg';
import type {GraphQLInputObjectType} from 'graphql';
import {type FieldArgs, ObjectStep, type SetterStep} from 'postgraphile/grafast';
import {
  type PgCodecRelationWithName,
  type PgTableResource,
  isDeletable,
  isInsertable,
  isNestedMutableResource,
  isPgTableResource,
  isUpdatable,
} from '../helpers.ts';

declare global {
  namespace GraphileBuild {
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

            const fields = Object.create(null);

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
                fields.connectByNodeId = {
                  name: connectByIdName,
                  type: connectByIdTypeName,
                };
              });

              // TODO: ADD TO BEHAVIORS
              // CONNECT BY KEYS
              const connectByKeysName = inflection.relationshipConnectFieldName({
                ...relationship,
                mode: 'key',
              });
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
              fields.connectByKeys = {
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
                  fields: ({fieldWithHooks}) => {
                    const RemoteResourceType = build.getInputTypeByName(
                      fields.insertable.type
                    );
                    return {
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
                                    ? RemoteResourceType
                                    : new GraphQLList(
                                        new GraphQLNonNull(RemoteResourceType)
                                      ),
                                description: wrapDescription(
                                  `A ${inflection.tableType(remoteResource.codec)} created and linked to this object`,
                                  'type'
                                ),
                                applyPlan: EXPORTABLE(
                                  () =>
                                    function plan($object: SetterStep, args: FieldArgs) {
                                      // will be ListStep or ObjectStep based on isUnique && !isReferencee
                                      console.log($object);
                                    },
                                  []
                                ),
                              }
                            ),
                          }
                        : {}),
                      ...(fields.connectByNodeId
                        ? {
                            [fields.connectByNodeId.name]: fieldWithHooks(
                              {
                                fieldName: fields.connectByNodeId.name,
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
                                        fields.connectByNodeId.type
                                      )
                                    : new GraphQLList(
                                        new GraphQLNonNull(
                                          build.getInputTypeByName(
                                            fields.connectByNodeId.type
                                          )
                                        )
                                      ),
                                applyPlan: EXPORTABLE(
                                  () =>
                                    function plan($object: SetterStep, args: FieldArgs) {
                                      // where you would connect the node id
                                      console.log($object);
                                    },
                                  []
                                ),
                                autoApplyAfterParentApplyPlan: true,
                              }
                            ),
                          }
                        : {}),
                    };
                  },
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
                          args.apply($object);
                        },
                      []
                    ),
                  })
                ),
              };
            }, {});

            return build.extend(
              fields,
              connectorFields,
              `Adding nested relationships to ${pgCodec.name}`
            );
          }
        }
        return fields;
      },
    },
  },
};
