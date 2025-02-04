import preset from "./graphile.config.ts";
import { postgraphile } from "postgraphile";
import { grafserv, websocket } from "@litewarp/grafserv-hono-adapter";
import { Hono } from "hono";
import { cors } from "hono/cors";

const PORT = preset.grafserv?.port ?? 5678;

const ORIGIN =
  process.env.NODE_ENV === "production"
    ? process.env.CLIENT_ORIGIN!
    : "http://localhost:3000";

const hono = new Hono({});

hono.use(
  cors({
    origin: [ORIGIN],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

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
