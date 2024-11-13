import {type ConnectionInitMessage, type Server, makeServer} from 'graphql-ws';
import {createBunWebSocket} from 'hono/bun';
import type {WSContext} from 'hono/ws';
import {type GrafservBase, makeGraphQLWSConfig} from 'postgraphile/grafserv';
import type {BunWebSocketData, BunWebSocketHandler, WsClient} from './types.js';

const {upgradeWebSocket, websocket: bunWs} = createBunWebSocket();

/**
 * The WebSocket sub-protocol used for the [GraphQL over WebSocket Protocol](https://github.com/graphql/graphql-over-http/blob/main/rfcs/GraphQLOverWebSocket.md).
 *
 * @category Common
 */
export const GRAPHQL_TRANSPORT_WS_PROTOCOL = 'graphql-transport-ws';

/*
 * Export the websocket transport for Bun
 */

export const websocket: BunWebSocketHandler<BunWebSocketData> = bunWs;

export const makeBunServer = (instance: GrafservBase) =>
  makeServer<ConnectionInitMessage['payload'], {socket: WSContext}>(
    makeGraphQLWSConfig(instance)
  );

export const createBunWsMiddleware = (server: Server<{socket: WSContext}>) =>
  upgradeWebSocket((_c) => {
    const clients = new WeakMap<WSContext, WsClient>();

    return {
      onOpen: (_evt, ws) => {
        const client: WsClient = {
          handleMessage: () => {
            throw new Error(`Message received before handler was registered`);
          },
          closed: () => {
            throw new Error(`Closed before handler was registered`);
          },
        };

        client.closed = server.opened(
          {
            // TODO: use protocol on socket once Bun exposes it
            protocol: GRAPHQL_TRANSPORT_WS_PROTOCOL,
            send: async (message) => {
              // ws might have been destroyed in the meantime, send only if exists
              if (clients.has(ws)) {
                ws.send(message);
              }
            },
            close: (code, reason) => {
              if (clients.has(ws)) {
                ws.close(code, reason);
              }
            },
            onMessage: (cb) => (client.handleMessage = cb),
          },
          {socket: ws}
        );

        clients.set(ws, client);
      },
      onMessage: (evt, ws) => {
        const client = clients.get(ws);
        if (!client) {
          throw new Error(`Message received for a missing client`);
        }
        return client?.handleMessage(String(evt.data));
      },
      onClose: (evt, ws) => {
        const client = clients.get(ws);
        if (!client) {
          throw new Error(`Close received for a missing client`);
        }
        return client.closed(evt.code, evt.reason);
      },
      onError: (evt, _ws) => {
        console.log('WebSocket error', evt);
      },
    };
  });
