/** @type {import("syncpack").RcFile} */
const config = {
  dependencyTypes: ["prod", "dev"],
  versionGroups: [
    {
      label: "Use workspace protocol when developing local packages",
      dependencies: ["$LOCAL"],
      dependencyTypes: ["!local"],
      pinVersion: "workspace:*",
    },
    {
      label:
        "All Postgraphile dependences use versions that @litewarp/hono-adapter uses",
      dependencies: [
        "postgraphile",
        "graphile-!(export)",
        "pg-**",
        "@dataplan/**",
      ],
      dependencyTypes: ["**"],
      snapTo: ["@litewarp/grafserv-hono-adapter"],
    },
  ],
};

export default config;
