import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsPlanResolverPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsPlanResolverPlugin',
  description:
    'Adds input fields for nested mutations to the input types of the schema and connects them to the plan resolver',
  version: '0.0.1',
  after: ['PgNestedMutationsInputTypesPlugin'],

  schema: {
    hooks: {
      GraphQLInputObjectType_fields(fields, build, context) {
        const {
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          getInputTypeByName,
          extend,
        } = build;

        const {
          fieldWithHooks,
          Self,
          scope: {isPgRowType, pgCodec},
        } = context;

        if (!isPgRowType || !pgCodec) {
          return fields;
        }

        const relationships = pgNestedMutationRelationships.get(pgCodec);
        if (!relationships) {
          return fields;
        }

        console.log(fields);

        const newFields = Object.values(relationships).reduce((acc, relationship) => {
          const {fieldName, mutationFields, rightTable} = relationship;
          const type = getInputTypeByName(mutationFields.input.typeName);
          console.log(type);
          return {
            ...acc,
            [fieldName]: fieldWithHooks(
              {
                fieldName: mutationFields.input.fieldName,
              },
              {
                description: `Nested mutation for ${rightTable.name}`,
                type,
              }
            ),
          };
        }, {});
        console.log(newFields);
        return extend(fields, {}, `Adding field for idk fields for ${Self.name}`);
      },
    },
  },
};
