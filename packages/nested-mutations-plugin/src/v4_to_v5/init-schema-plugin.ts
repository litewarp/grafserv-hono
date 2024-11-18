import type {PgResource} from '@dataplan/pg';
import type {} from 'graphile-build-pg';
import type {GraphQLInputObjectType} from 'graphql';
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
        relationship: PgCodecRelationWithName
      ): string;
      relationshipConnectInputType(
        this: Inflection,
        relationship: PgCodecRelationWithName
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
      isRelationshipInverse?: boolean;
      remoteResource?: PgTableResource;
    }
    interface ScopeInputObjectFieldsField {
      isRelationshipCreateInputField?: boolean;
      isRelationshipConnectorField?: boolean;
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
      relationshipCreateFieldName(_options, {remoteResource}) {
        return this.camelCase(`create-${this.tableFieldName(remoteResource)}`);
      },
      relationshipCreateInputType(_options, {relationName}) {
        return this.upperCamelCase(`create-${relationName}-input`);
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
          graphql: {GraphQLList, GraphQLNonNull},
          wrapDescription,
        } = build;

        const connectorInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        tableResources.forEach((resource) => {
          const relationships = Object.entries(resource.getRelations())
            .filter(([_, r]) => isNestedMutableResource(build, r.remoteResource))
            .map(([relationName, details]) => ({...details, relationName}));

          relationships.forEach((relationship) => {
            const {isReferencee, isUnique, remoteResource, relationName} = relationship;

            // create the connector type
            const connectorTypeName = inflection.relationshipInputType(relationship);

            if (connectorInputTypes.has(connectorTypeName)) {
              console.log(`Skipping ${connectorTypeName}: already exists`);
              return;
            }
            connectorInputTypes.add(connectorTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);

            const fields = Object.create(null);

            if (insertable) {
              const createFieldName =
                inflection.relationshipCreateFieldName(relationship);
              const createTypeName = inflection.relationshipCreateInputType(relationship);

              fields.insertable = {name: createFieldName, type: createTypeName};

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  createTypeName,
                  {
                    isRelationshipCreateInputType: true,
                    remoteResource,
                  },
                  () => ({
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
              });
            }

            if (updateable) {
            }

            if (deletable) {
            }

            build.recoverable(null, () => {
              build.registerInputObjectType(
                connectorTypeName,
                {
                  relationName: relationName,
                  isRelationshipInputType: true,
                  isRelationshipInverse: isReferencee,
                  remoteResource: remoteResource,
                },
                () => ({
                  description: wrapDescription(``, 'type'),
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
                                //applyPlan
                              }
                            ),
                          }
                        : {}),
                    };
                  },
                }),
                `Creating connector input type for relationship ${relationName}`
              );
            });
          });
        });
        return _;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {inflection, wrapDescription} = build;
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
                    description: wrapDescription(
                      `Nested connector type for ${relationship.relationName}`,
                      'field'
                    ),
                    type: InputType,
                    // applyPlan
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
