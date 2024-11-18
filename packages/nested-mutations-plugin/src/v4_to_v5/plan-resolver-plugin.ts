import {FieldArgs, ObjectStep, __TrackedValueStep} from 'postgraphile/grafast';
import {isPgTableResource} from '../helpers.ts';

export const PgNestedMutationsPlanResolverPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsPlanResolverPlugin',
  description: 'Augments the plan resolvers for the top-level mutation payloads',
  version: '0.0.1',

  schema: {
    hooks: {
      // GraphQLObjectType_fields: (fields, build, context) => {
      //   const {graphql} = build;
      //   const {
      //     scope: {isRootMutation},
      //   } = context;

      //   console.log(isRootMutation, Object.keys(context.scope));

      //   return fields;
      // },
      GraphQLObjectType_fields_field: (field, build, context) => {
        const {inflection, graphql, wrapDescription, extend, EXPORTABLE} = build;
        const {
          scope: {
            fieldName,
            fieldBehaviorScope,
            isMutationPayload,
            isPgUpdatePayloadType,
            isPgDeletePayloadType,
            isPgCreatePayloadType,
            isRootMutation,
            isPgMutationPayloadEdgeField,
            isPgMutationPayloadDeletedNodeIdField,
            pgTypeResource,
          },
          fieldWithHooks,
        } = context;

        if (
          !isMutationPayload ||
          isPgMutationPayloadEdgeField ||
          !fieldBehaviorScope ||
          isPgMutationPayloadDeletedNodeIdField
        ) {
          return field;
        }

        return {
          ...field,
          plan: EXPORTABLE(
            () =>
              function plan($object: ObjectStep, args, info) {
                const $input = args.get();
              },
            []
          ),
        };
      },
    },
  },
};
