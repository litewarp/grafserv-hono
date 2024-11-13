import type {GraphileConfig} from 'graphile-build';
import {
  PostGraphileNestedMutationsConnectPlugin,
  PostGraphileNestedMutationsCreatePlugin,
  PostGraphileNestedMutationsUpdatePlugin,
  PostGraphileNestedTypesPlugin,
} from './plugins';

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [
    PostGraphileNestedMutationsConnectPlugin,
    PostGraphileNestedMutationsCreatePlugin,
    PostGraphileNestedMutationsUpdatePlugin,
    PostGraphileNestedTypesPlugin,
  ],
};
