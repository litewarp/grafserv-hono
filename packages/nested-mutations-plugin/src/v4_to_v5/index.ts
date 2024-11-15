import {PgNestedMutationsConnectTypesPlugin} from './connect-type-plugin.ts';
import {PgNestedMutationsCreateTypesPlugin} from './create-type-plugin.ts';
import {PgNestedMutationsDeleteTypesPlugin} from './delete-type-plugin.ts';
import {PgNestedMutationsInflectionPlugin} from './inflection-plugin.ts';
import {PgNestedMutationsInitSchemaPlugin} from './init-schema-plugin.ts';
import {PgNestedMutationsInputTypesPlugin} from './input-type-plugin.ts';
import {PgNestedMutationsUpdateTypesPlugin} from './update-type-plugin.ts';

export const Plugins = [
  PgNestedMutationsInflectionPlugin,
  PgNestedMutationsInitSchemaPlugin,
  PgNestedMutationsConnectTypesPlugin,
  PgNestedMutationsUpdateTypesPlugin,
  PgNestedMutationsDeleteTypesPlugin,
  PgNestedMutationsCreateTypesPlugin,
  PgNestedMutationsInputTypesPlugin,
];

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: Plugins,
};
