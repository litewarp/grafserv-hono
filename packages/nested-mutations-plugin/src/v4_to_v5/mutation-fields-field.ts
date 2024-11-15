import {pgInsertSingle} from '@dataplan/pg';
import type {CallbackOrDescriptor} from 'graphile-config';
import type {GraphQLFieldResolver} from 'graphql';
import type {
  ExecutableStep,
  FieldArgs,
  FieldInfo,
  FieldPlanResolver,
  GrafastFieldConfig,
  ObjectStep,
  __InputObjectStepWithDollars,
} from 'postgraphile/grafast';
import {condition, constant, specFromNodeId} from 'postgraphile/grafast';
import {isPgTableResource} from '../helpers.ts';

const UmWhatWhat: GraphileConfig.Plugin = {
  name: 'umwhatwhat',
  version: '0.0.1',
  schema: {
    hooks: {
      build: (build) => {
        build.resourceInputTypes = new Set();
        return build;
      },
      init(_init, build) {
        const {resourceInputTypes, getGraphQLTypeNameByPgCodec} = build;

        const {pgResources} = build.input.pgRegistry;

        for (const resource of Object.values(pgResources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }
          const typeName = getGraphQLTypeNameByPgCodec(resource.codec, 'input');
          if (!typeName) {
            throw new Error(`Could not determine input type for ${resource.name}`);
          }
          resourceInputTypes.add(typeName);
        }

        return _init;
      },

      GraphQLInputObjectType_fields: (fields, build, context) => {
        const {resourceInputTypes} = build;
        const {Self} = context;
        const isResourceInput = resourceInputTypes.has(Self.name);
        if (isResourceInput) {
          // add the input field
        }
        return fields;
      },

      GraphQLObjectType_fields_field: (field, build, context) => {
        const {
          extend,
          inflection,
          // nodeIdFieldName - inflection.nodeIdFieldName
          sql,
          // omit?
          // gql2pg,
          // parseResolveInfo
          getTypeByName,
          // getTypeAndIdentifiersFromNodeId - specFromNodeId
          // pgColumnFilter,
          // queryFromResolveData,
          pgNestedPluginForwardInputTypes,
          pgNestedPluginReverseInputTypes,
          pgNestedCreateResolvers,
          pgNestedUpdateResolvers,
          pgNestedTableConnectorFields,
          pgNestedTableConnect,
          pgNestedTableDeleterFields,
          pgNestedTableDelete,
          pgNestedTableUpdaterFields,
          pgNestedTableUpdate,
          // viaTemporaryTable
          // pgGetGqlTypeByTypeIdAndModifier
          getGraphQLTypeByPgCodec,
        } = build;

        const {
          scope: {
            isPgCreateMutationField,
            isPgUpdateMutationField,
            pgFieldResource: table,
            // pgFieldIntrospection: table,
            // pgFieldConstraint,
          },
          // addDataGenerator,
          // getDataFromParsedResolveInfoFragment,
        } = context;

        // if no resource, do nothingc
        if (!table || !isPgTableResource(table)) {
          return field;
        }

        // if not a create or update field, do nothing
        if (!isPgCreateMutationField && !isPgUpdateMutationField) {
          return field;
        }

        // if we don't have any forward or reverse types, add fieldresolver to create resolvers
        if (
          !pgNestedPluginForwardInputTypes.has(table.identifier) &&
          !pgNestedPluginReverseInputTypes.has(table.identifier)
        ) {
          pgNestedCreateResolvers.set(table.identifier, field.resolve);
          return field;
        }

        const TableType = getGraphQLTypeByPgCodec(table.codec, 'output');

        // ensure the table's primary keys are always available in a query
        const tablePrimaryKey = table.uniques.find(({isPrimary}) => isPrimary);

        if (tablePrimaryKey) {
          // Where you used to use addArgDataGenerator you should now give your argument an applyPlan and set autoApplyAfterParentPlan: true so that the plan is automatically applied (without the parent field having to call fieldArgs.apply($target, 'argName')).
        }

        const recurseForwardNestedMutations = (
          $parent: ExecutableStep,
          args: FieldArgs,
          info: FieldInfo
        ) => {
          const nestedFields = pgNestedPluginForwardInputTypes.get(table.identifier);
          if (!nestedFields) {
            return {};
          }
          // object that has any ids that were created
          const output: Record<string, ExecutableStep> = {};

          for (const nestedField of nestedFields) {
            const {
              fieldName,
              rightTable,
              remoteUnique,
              localUnique,
              leftTable,
              localAttributes,
              remoteAttributes,
            } = nestedField;
            const $fieldValue = args.getRaw(['input', fieldName]);

            if (!condition('exists', $fieldValue)) {
              return;
            }

            // todo: make sure fieldvalue is an objectStep
            const $fieldVal = $fieldValue as __InputObjectStepWithDollars;
            console.log($fieldVal);

            const $updateById = $fieldVal.get('updateById');
            const $updateByNodeId = $fieldVal.get('updateByNodeId');
            const $create = $fieldVal.get('create');

            if (
              condition('exists', $updateById) ||
              condition('exists', $updateByNodeId)
            ) {
              // updateById
            }

            const connectorFields = pgNestedTableConnectorFields.get(table.identifier);
            if (connectorFields) {
              for (const connectorField of connectorFields) {
                const {fieldName, typeName} = connectorField;
                // run the connect function
                if (condition('exists', $fieldVal.get(fieldName))) {
                  // run the update plan
                  // if pk is not in the input object, we need to create it
                }
              }
            }

            const updaterFields = pgNestedTableConnectorFields.get(table.identifier);
            if (updaterFields) {
              for (const updaterField of updaterFields) {
                const {fieldName, typeName} = updaterField;
                // run the connect function
                if (condition('exists', $fieldVal.get(fieldName))) {
                  // run the update plan
                }
              }
            }

            const deleterFields = pgNestedTableDeleterFields.get(table.identifier);
            if (deleterFields) {
              for (const deleterField of deleterFields) {
                const {fieldName, typeName} = deleterField;
                if (condition('exists', $fieldVal.get(fieldName))) {
                  // run the delete plan
                }
              }
            }

            if (condition('exists', $create)) {
              // run the create plan
              //
              // recurse input object
              //
              // create the right tableobject
              const $createdRow = pgInsertSingle(rightTable);
              for (const key of Object.keys(rightTable.codec.attributes)) {
                const $val = $fieldVal.get(
                  inflection.attribute({
                    attributeName: key,
                    codec: rightTable.codec,
                  })
                );
                if (condition('exists', $val)) {
                  $createdRow.set(key, $fieldVal.get(key));
                }
              }
              // store the created id in the output object
              remoteAttributes.forEach((k, idx) => {
                if (!localAttributes[idx]) {
                  throw new Error(
                    'localAttributes and remoteAttributes must be the same length'
                  );
                }
                const returnKey = inflection.attribute({
                  attributeName: localAttributes[idx],
                  codec: leftTable.codec,
                });

                output[returnKey] = $createdRow.get(k);
              });
            }
          }
        };

        const newPlanResolver: FieldPlanResolver<
          // targs
          Record<string, unknown>,
          // tparent
          ExecutableStep,
          // tresult
          ExecutableStep
        > = ($parent, args, info): ExecutableStep => {
          // update the parent object with the nested mutation ids

          return $parent;
        };

        // resolveData ...

        return extend(
          field,
          {
            plan($parent, args, info) {
              return newPlanResolver($parent, args, info);
            },
          },
          `Adding nested plan for ${table.name}`
        );
      },
    },
  },
};
