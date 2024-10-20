import type { GraphileConfig } from "graphile-build";
import {
  PostGraphileNestedTypesPlugin,
  PostGraphileNestedMutationsConnectPlugin,
  PostGraphileNestedMutationsCreatePlugin,
  PostGraphileNestedMutationsUpdatePlugin,
} from "./plugins";

export const NestedMutationPreset: GraphileConfig.Preset = {
  plugins: [
    PostGraphileNestedMutationsConnectPlugin,
    PostGraphileNestedMutationsCreatePlugin,
    PostGraphileNestedMutationsUpdatePlugin,
    PostGraphileNestedTypesPlugin,
  ],
};
