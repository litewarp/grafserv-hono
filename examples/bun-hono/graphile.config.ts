import "graphile-config";
import type { GraphileConfig } from "graphile-config";
import "postgraphile";
import { makePgService } from "postgraphile/adaptors/pg";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { makeV4Preset } from "postgraphile/presets/v4";
import { PostGraphileRelayPreset } from "postgraphile/presets/relay";

const isProduction = process.env.NODE_ENV === "production";

const preset: GraphileConfig.Preset = {
  extends: [
    PostGraphileAmberPreset,
    makeV4Preset({
      graphiql: !isProduction,
    }),
    PostGraphileRelayPreset,
  ],
  grafserv: {
    port: isProduction ? 8080 : 5678,
    graphiql: !isProduction,
    graphiqlOnGraphQLGET: !isProduction,
  },
  pgServices: [
    makePgService({
      connectionString: process.env.POSTGRES_DB_URL,
      schemas: [
        "public",
        "app_public",
        "app_private",
      ],
    }),
  ],
};

export default preset;
