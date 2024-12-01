import {
  PgInsertSingleStep,
  type PgResource,
  PgUpdateSingleStep,
  pgUpdateSingle,
} from '@dataplan/pg';
import {
  type GraphQLInputField,
  type GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  type GraphQLSchema,
} from 'graphql';
import type {} from 'postgraphile';
import {
  type FieldArgs,
  ObjectStep,
  SetterStep,
  __InputListStep,
  __InputObjectStep,
  type __TrackedValueStep,
  specFromNodeId,
} from 'postgraphile/grafast';
import {getNestedCreatePlanResolver} from './dorothy.ts';
import {
  type PgTableResource,
  isDeletable,
  isInsertable,
  isPgTableResource,
  isUpdatable,
} from './helpers.ts';
import {
  type PgRelationshipMutationsRelationshipData,
  getRelationships,
} from './relationships.ts';

export interface ResourceRelationshipMutationFields {
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

interface PgRelationshipMutationFieldInfo {
  fieldName: string;
  typeName: string;
  mode: 'node' | 'keys';
  remoteResource: PgTableResource;
}

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRootFieldNamesToCodec: Map<string, PgTableResource>;
      pgRelationshipMutationFieldsByType: Map<string, ResourceRelationshipMutationFields>;
      pgRelationshipInputTypes: Record<string, PgRelationshipMutationsRelationshipData[]>;
      //
      pgRelationshipConnectorFields: Record<string, PgRelationshipMutationFieldInfo[]>;
    }
    interface Inflection {
      relationshipConnectByNodeIdFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipConnectByNodeIdInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipConnectByKeysFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipConnectByKeysInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipCreateFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipCreateInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipDeleteFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipDeleteInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipInputFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipUpdateByNodeIdFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipUpdateByNodeIdInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipUpdateByKeysFieldName(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
      relationshipUpdateByKeysInputType(
        this: Inflection,
        relationship: PgRelationshipMutationsRelationshipData
      ): string;
    }
    interface ScopeInputObject {
      name?: string;
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
  after: ['smart-tags', 'PgFakeConstraintsPlugin', 'PgTablesPlugin', 'PgRelationsPlugin'],
  experimental: true,

  inflection: {
    add: {
      relationshipConnectByNodeIdFieldName(_options, _relationship) {
        return this.camelCase(`connect-by-${this.nodeIdFieldName()}`);
      },
      relationshipConnectByNodeIdInputType(_options, {name}) {
        return this.upperCamelCase(`${name}-connect-by-node-id-input`);
      },
      relationshipConnectByKeysFieldName(_options, {remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`connect-by-${attrs.join('-and-')}`);
      },
      relationshipConnectByKeysInputType(_options, {name, remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(`${name}-connect-by-${attrs.join('-and-')}-input`);
      },
      relationshipCreateFieldName(_options, _relationship) {
        return this.camelCase(`create`);
      },
      relationshipCreateInputType(_options, {name}) {
        return this.upperCamelCase(`${name}-create-input`);
      },
      relationshipInputFieldName(_options, relationship) {
        const {
          remoteResource,
          isUnique,
          isReferencee,
          localAttributes,
          remoteAttributes,
        } = relationship;

        const attributes = (!isReferencee ? localAttributes : remoteAttributes).map(
          (a) => a.name
        );
        const resourceName = isUnique
          ? remoteResource.name
          : this.pluralize(remoteResource.name);

        return this.camelCase(`${resourceName}-by-${attributes.join('-and-')}`);
      },
      relationshipInputType(_options, {name}) {
        return this.upperCamelCase(`${name}Input`);
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        /**
         * Instantiate the context properties on the build object
         */
        build.pgRelationshipInputTypes = {};
        build.pgRelationshipConnectorFields = {};
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRootFieldNamesToCodec = new Map();
        build.pgRelationshipMutationFieldsByType = new Map();

        return build;
      },

      init(_, build) {
        const {
          inflection,
          EXPORTABLE,
          graphql: {GraphQLList, GraphQLNonNull},
        } = build;

        const relationshipInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        tableResources.forEach((resource) => {
          const relationships = getRelationships(build, resource);

          build.pgRelationshipInputTypes[resource.name] = relationships;

          const inputFields: {name: string; type: string}[] = [];

          relationships.forEach((relationship) => {
            const {
              isReferencee,
              isUnique,
              remoteResource,
              name,
              remoteAttributes,
              localAttributes,
              localResource,
            } = relationship;

            inputFields.push({
              name: inflection.relationshipInputFieldName(relationship),
              type: inflection.relationshipInputType(relationship),
            });

            const relationshipTypeName = inflection.relationshipInputType(relationship);

            if (relationshipInputTypes.has(relationshipTypeName)) {
              // console.log(`Skipping ${relationshipTypeName}: already exists`);
              return;
            }
            relationshipInputTypes.add(relationshipTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);
            // for now, if you're updateable, you are connectable
            const connectable = updateable;

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
                    description: build.wrapDescription(
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
                        ).reduce((memo, [name, field]) => {
                          if (
                            isReferencee
                            // TODO: add validation so that if the remote attribute is not present, the create field is present
                            // &&
                            // remoteAttributes.find(
                            //   (a) =>
                            //     inflection.attribute({
                            //       attributeName: a.name,
                            //       codec: remoteResource.codec,
                            //     }) === name
                            // )
                          ) {
                            return {
                              ...memo,
                              [name]: fieldWithHooks(
                                {fieldName: name},
                                {
                                  ...field,
                                  type: build.graphql.isNonNullType(field.type)
                                    ? field.type.ofType
                                    : field.type,
                                }
                              ),
                            };
                          }
                          return {
                            ...memo,
                            [name]: fieldWithHooks({fieldName: name}, field),
                          };
                        }, Object.create(null)),
                      };
                    },
                  }),
                  `Add a relationship create input type for ${remoteResource.name} on ${name}`
                );
                fields.insertable = {
                  name: createFieldName,
                  type: createTypeName,
                };
              });
            }

            if (updateable) {
            }
            if (deletable) {
            }
            if (connectable) {
              // use update for now
              // const mode = getUniqueMode(build, remoteResource, 'update');
              const mode = 'node';

              if (mode === 'node') {
                const fieldName =
                  inflection.relationshipConnectByNodeIdFieldName(relationship);
                const typeName =
                  inflection.relationshipConnectByNodeIdInputType(relationship);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    typeName,
                    {isRelationshipNodeIdConnectInputType: true},
                    () => ({
                      description: build.wrapDescription(
                        `Relationship connect by node id input field for ${remoteResource.name} in the ${relationship.name} relationship`,
                        `type`
                      ),
                      fields: ({fieldWithHooks}) => {
                        return {
                          [inflection.nodeIdFieldName()]: fieldWithHooks(
                            {fieldName: inflection.nodeIdFieldName()},
                            () => ({
                              description: build.wrapDescription(
                                `The node id input field to connect ${remoteResource.name} in the ${relationship.name} relationship`,
                                'field'
                              ),
                              type: new GraphQLNonNull(build.graphql.GraphQLID),
                            })
                          ),
                        };
                      },
                    }),
                    `Creating relationship connect by node id input type for ${relationship.name} relationship`
                  );
                  fields.connectable.byNodeId = {
                    name: fieldName,
                    type: typeName,
                  };
                });
              } else {
              }
            }

            build.recoverable(null, () => {
              const relFieldNames = (
                build.pgRelationshipInputTypes[remoteResource.name] ?? []
              ).map((r) => r.fieldName);

              build.pgRelationshipInputTypes[remoteResource.name] ?? [];
              build.registerInputObjectType(
                relationshipTypeName,
                {
                  name,
                  isRelationshipInputType: true,
                  isRelationshipInverse: isReferencee,
                  remoteResource: remoteResource,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: build.wrapDescription(
                    `Relationship input type for ${name}`,
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
                              description: build.wrapDescription(
                                `A ${inflection.tableType(remoteResource.codec)} created and linked to this object`,
                                'type'
                              ),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (build, getNestedCreatePlanResolver, relationship) => {
                                  return getNestedCreatePlanResolver(build, relationship);
                                },
                                [build, getNestedCreatePlanResolver, relationship]
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
                              description: build.wrapDescription(
                                `Connect ${remoteResource.name} by node id in the ${name} relationship`,
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
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (
                                  __InputListStep,
                                  __InputObjectStep,
                                  build,
                                  inflection,
                                  localAttributes,
                                  pgUpdateSingle,
                                  relFieldNames,
                                  remoteAttributes,
                                  remoteResource,
                                  specFromNodeId
                                ) =>
                                  function plan(
                                    $object: PgUpdateSingleStep | PgInsertSingleStep,
                                    args: FieldArgs
                                  ) {
                                    const $rawArgs = args.getRaw();
                                    const nodeIdHandler =
                                      build.getNodeIdHandler &&
                                      build.getNodeIdHandler(
                                        inflection.tableType(remoteResource.codec)
                                      );
                                    if (!nodeIdHandler) {
                                      throw new Error(
                                        `No nodeIdHandler found for ${remoteResource.name}`
                                      );
                                    }
                                    if ($rawArgs instanceof __InputObjectStep) {
                                      // key to add is on the parent
                                      // set it and return
                                      const spec = specFromNodeId(
                                        nodeIdHandler,
                                        $rawArgs.get(inflection.nodeIdFieldName())
                                      );

                                      Object.keys(spec).forEach((key) => {
                                        const remoteAttrIdx = remoteAttributes
                                          .map((a) => a.name)
                                          .indexOf(key);

                                        const local = localAttributes[remoteAttrIdx];
                                        if (local) {
                                          $object.set(local.name, spec[key]);
                                        }
                                      });

                                      // Since we're setting fields on the parent object
                                      // we can just return it
                                      return $object;
                                    } else if ($rawArgs instanceof __InputListStep) {
                                      // do something
                                      // keys are on the children
                                      const length = $rawArgs.evalLength() ?? 0;
                                      for (let i = 0; i < length; i++) {
                                        const $rawArg = $rawArgs.at(i);
                                        if (!($rawArg instanceof __InputObjectStep)) {
                                          console.warn(
                                            `Unexpected args type: ${$rawArg.constructor.name}`
                                          );
                                          continue;
                                        }
                                        const attrs = remoteAttributes.reduce(
                                          (memo, remote, idx) => {
                                            const local = localAttributes[idx];
                                            if (!local || !remote) return memo;
                                            return {
                                              ...memo,
                                              [remote.name]: $object.get(local.name),
                                            };
                                          },
                                          {}
                                        );

                                        const spec = specFromNodeId(
                                          nodeIdHandler,
                                          $rawArg.get(inflection.nodeIdFieldName())
                                        );
                                        const $item = pgUpdateSingle(
                                          remoteResource,
                                          spec,
                                          attrs
                                        );

                                        relFieldNames.forEach((field) =>
                                          args.apply($item, [i, field])
                                        );
                                      }
                                    } else {
                                      console.warn(
                                        `Unexpected args type: ${$rawArgs.constructor.name}`
                                      );
                                      return;
                                    }
                                  },
                                [
                                  __InputListStep,
                                  __InputObjectStep,
                                  build,
                                  inflection,
                                  localAttributes,
                                  pgUpdateSingle,
                                  relFieldNames,
                                  remoteAttributes,
                                  remoteResource,
                                  specFromNodeId,
                                ]
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connectable.byKeys ? {} : {}),

                    ...(fields.updateable.byNodeId ? {} : {}),
                    ...(fields.updateable.byKeys ? {} : {}),

                    ...(fields.deletable.byNodeId ? {} : {}),
                    ...(fields.deletable.byKeys ? {} : {}),
                  }),
                }),
                `Creating input type for relationship ${name}`
              );
              build.pgRelationshipMutationFieldsByType.set(relationshipTypeName, fields);
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
          if (resource && isPgTableResource(resource)) {
            const relationships = getRelationships(build, resource);
            const connectorFields: GraphQLInputFieldConfigMap = relationships.reduce(
              (memo, relationship) => {
                const fieldName = inflection.relationshipInputFieldName(relationship);
                const typeName = inflection.relationshipInputType(relationship);
                const InputType = build.getInputTypeByName(typeName);

                build.pgRelationshipConnectorFields[pgCodec.name] = [
                  ...(build.pgRelationshipConnectorFields[pgCodec.name] ?? []),
                  {
                    fieldName,
                    typeName,
                    mode: 'node',
                    remoteResource: relationship.remoteResource,
                  },
                ];

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
                        `Nested connector type for ${relationship.name}`,
                        'field'
                      ),
                      type: InputType,
                      autoApplyAfterParentApplyPlan: true,
                      applyPlan: EXPORTABLE(
                        (PgInsertSingleStep, PgUpdateSingleStep, SetterStep) =>
                          function plan(
                            $obj: SetterStep,
                            fieldArgs: FieldArgs,
                            _info: {
                              entity: GraphQLInputField;
                              schema: GraphQLSchema;
                            }
                          ) {
                            if (
                              $obj instanceof PgInsertSingleStep ||
                              $obj instanceof PgUpdateSingleStep
                            ) {
                              fieldArgs.apply($obj);
                              //
                            } else if ($obj instanceof SetterStep) {
                              //
                            }
                          },
                        [PgInsertSingleStep, PgUpdateSingleStep, SetterStep]
                      ),
                    })
                  ),
                };
              },
              Object.create(null)
            );

            const rootFields = mapPgRelationshipRootFields(
              build,
              resource,
              connectorFields
            );

            Object.entries(rootFields).forEach(([fieldName, paths]) => {
              build.pgRelationshipMutationRootFields.set(fieldName, paths);
              build.pgRootFieldNamesToCodec.set(fieldName, resource);
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
        const {EXPORTABLE} = build;
        const {
          scope: {isRootMutation, fieldName},
        } = context;

        if (isRootMutation) {
          const resource = build.pgRootFieldNamesToCodec.get(fieldName);
          if (!resource) return field;
          const inputTypes = build.pgRelationshipInputTypes[resource.name] ?? [];
          const rootFields = build.pgRelationshipMutationRootFields.get(fieldName);
          if (!rootFields || !inputTypes) return field;

          return {
            ...field,
            plan: EXPORTABLE(
              (field, rootFields) =>
                function plan($parent: __TrackedValueStep, fieldArgs, info) {
                  if (!field.plan) return $parent;
                  // const $insertSingle = pgInsertSingle(resource);
                  // const $object = build.grafast.object({result: $insertSingle});
                  const $object = field.plan($parent, fieldArgs, info);
                  const $insertSingle = $object.get('result');

                  rootFields.forEach((path) => {
                    fieldArgs.apply($insertSingle, path);
                  });

                  return $object;
                },
              [field, rootFields]
            ),
          };
        }

        return field;
      },
    },
  },
};

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
  connectorFields: GraphQLInputFieldConfigMap
): Record<TFieldName, string[][]> => {
  const fieldNames: string[] = [];
  const paths: string[][] = [];

  if (isInsertable(build, resource)) {
    fieldNames.push(build.inflection.createField(resource));
    paths.push(['input', build.inflection.tableFieldName(resource)]);
  }
  // if (isUpdateable(build, resource)) {
  //   fieldNames.push(
  //     build.inflection.patchField(build.inflection.tableFieldName(resource))
  //   );
  //   paths.push(['input', 'patch']);
  // }

  const allPaths = Object.keys(connectorFields).reduce((memo, connectorFieldName) => {
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
