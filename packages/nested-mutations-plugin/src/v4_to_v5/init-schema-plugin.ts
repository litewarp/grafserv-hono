import {isPgTableResource} from '../helpers.ts';
import {getNestedRelationships} from './get-nested-relationships.ts';

export const PgNestedMutationsInitSchemaPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsInitSchemaPlugin',
  description: 'Gathers the context data for the nested mutations plugin',
  version: '0.0.1',

  schema: {
    hooks: {
      build(build) {
        /**
         * Instantiate the context properties on the build object
         */

        build.pgNestedMutationRelationships = new Map();
        build.pgNestedMutationInputObjMap = new Map();
        build.pgNestedMutationInputTypes = new Set();

        return build;
      },

      init(_init, build) {
        const {pgNestedMutationRelationships} = build;

        for (const resource of Object.values(build.input.pgRegistry.pgResources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }
          const relationships = getNestedRelationships(resource, build);
          pgNestedMutationRelationships.set(resource.codec, relationships);
        }

        return _init;
      },
    },
  },
};
