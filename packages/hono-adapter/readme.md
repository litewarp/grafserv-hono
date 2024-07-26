# Hono Adapter for Grafserv

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