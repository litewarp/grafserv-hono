# Hono Adapter for Grafserv

This is a rough attempt at constructing a Grafserv adapter for [Hono](https://hono.dev).

Hono supports a variety of different environments and frameworks, so full support will likely depend on where you will be deploying the server.

This particular implementation uses [Bun](https://bun.sh) as the server runtime to add support for websockets.

One of the next steps will be to separate the concerns into a core grafserv module that translates requests to hono and then include a variety of adapters for websockets or other runtimes (e.g., [cloudfare workers](https://hono.dev/docs/getting-started/cloudflare-workers) or [supabase functions](https://hono.dev/docs/getting-started/supabase-functions)).

Any input is appreciated! You can leave an issue here or find me on discord @litewarp.

## Example Usage

```
import preset from "./graphile.config.ts";
import { postgraphile } from "postgraphile";
import { grafserv, websocket } from "@litewarp/grafserv-hono-adapter";
import { Hono } from "hono";

const PORT = preset.grafserv?.port ?? 5678;

const hono = new Hono({});

hono.onError((e, c) => {
  console.error(e);
  return c.text("Internal Server Error", 500);
});

const pgl = postgraphile(preset);

const serv = pgl.createServ(grafserv);

serv.addTo(hono);

console.log("Server listening on port " + PORT);

export default {
  port: PORT,
  fetch: hono.fetch,
  websocket,
};

```
