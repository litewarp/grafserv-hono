import {PgNestedMutationsInitSchemaPlugin} from './relationship-mutations-plugin.ts';

export const RelationshipMutationsPreset: GraphileConfig.Preset = {
  plugins: [PgNestedMutationsInitSchemaPlugin],
};
