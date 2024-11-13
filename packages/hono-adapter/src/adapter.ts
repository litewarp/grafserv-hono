import type {Hono, Context as HonoContext} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {stream} from 'hono/streaming';
import type {StatusCode} from 'hono/utils/http-status';
import {
  type EventStreamHeandlerResult,
  GrafservBase,
  type GrafservConfig,
  type RequestDigest,
  type Result,
  convertHandlerResultToResult,
  normalizeRequest,
} from 'postgraphile/grafserv';
import {createBunWsMiddleware, makeBunServer} from './bun-websocket.js';
import {processHeaders} from './utils.js';

declare global {
  namespace Grafast {
    interface RequestContext {
      hono: {context: HonoContext};
    }
  }
}

export class HonoGrafserv extends GrafservBase {
  constructor(config: GrafservConfig) {
    super(config);
  }

  protected getDigest(c: HonoContext): RequestDigest {
    const httpVersionMajor = 1;
    const httpVersionMinor = 1;

    c.req.raw;

    const isSecure = c.req.url.startsWith('https://');

    return {
      httpVersionMajor,
      httpVersionMinor,
      isSecure: isSecure, // we don't trust x-forwarded-proto
      method: c.req.method,
      path: c.req.path,
      headers: processHeaders(c.req.raw.headers.toJSON()),
      getQueryParams: () => c.req.query(),
      getBody: async () => {
        return {type: 'json', json: await c.req.json()};
      },
      requestContext: {
        hono: {context: c},
      },
      preferJSON: true,
    };
  }

  public async send(response: Result | null, c: HonoContext) {
    if (response === null) {
      return c.notFound();
    }

    switch (response.type) {
      case 'error': {
        const {statusCode, headers, error} = response;

        return c.body(error.message, statusCode as StatusCode, {
          ...processHeaders(headers),
          'Content-Type': 'text/plain',
        });
      }
      case 'buffer': {
        const {statusCode, headers, buffer} = response;

        return c.body(buffer.toString('utf8'), statusCode as StatusCode, {
          ...processHeaders(headers),
        });
      }
      case 'json': {
        const {statusCode, headers, json} = response;
        return c.body(JSON.stringify(json), statusCode as StatusCode, {
          ...processHeaders(headers),
        });
      }

      case 'noContent': {
        const {statusCode, headers} = response;
        return c.body(null, statusCode as StatusCode, {...headers});
      }

      case 'bufferStream': {
        return stream(c, async (stream) => {
          const {statusCode, headers, lowLatency, bufferIterator} = response;
          let bufferIteratorHandled = false;

          try {
            if (lowLatency) {
              //
            }
            // set the headers
            Object.entries(processHeaders(headers)).forEach(([key, value]) => {
              c.header(key, value);
            });
            c.status(statusCode as StatusCode);

            try {
              bufferIteratorHandled = true;
              for await (const buffer of bufferIterator) {
                stream.write(buffer);
              }
            } finally {
              stream.close();
            }
          } catch (e) {
            if (!bufferIteratorHandled) {
              try {
                if (bufferIterator.return) {
                  bufferIterator.return();
                } else if (bufferIterator.throw) {
                  bufferIterator.throw(e);
                }
              } catch (_e2) {
                // nom nom nom
              }
              throw e;
            }
          }
        });
      }

      default: {
        console.log('Unhandled:');
        console.dir(response);
        return c.body("Server hasn't implemented this yet", 501, {
          'Content-Type': 'text/plain',
        });
      }
    }
  }

  async addTo(app: Hono) {
    const {
      graphiql,
      graphiqlOnGraphQLGET,
      graphqlPath,
      graphiqlPath,
      graphqlOverGET,
      maxRequestLength,
      watch,
    } = this.dynamicOptions;
    const websockets = this.resolvedPreset.grafserv?.websockets ?? false;
    const exposeGetRoute = graphqlOverGET || graphiqlOnGraphQLGET || websockets;

    // build HTTP handler
    const graphqlHandler = async (c: HonoContext) => {
      const digest = this.getDigest(c);
      const handlerResult = await this.graphqlHandler(
        normalizeRequest(digest),
        this.graphiqlHandler
      );
      const result = await convertHandlerResultToResult(handlerResult);
      return this.send(result, c);
    };

    // build websocket handler
    const wsHandler = websockets ? makeBunServer(this) : undefined;

    // attach http handler for POST requests
    app.post(
      graphqlPath,
      graphqlHandler,
      bodyLimit({
        maxSize: maxRequestLength,
      })
    );

    // attach websocket and http handler for GET requests, if desired
    if (exposeGetRoute) {
      app.get(graphqlPath, graphqlHandler);
      if (wsHandler) {
        app.get(graphqlPath, createBunWsMiddleware(wsHandler));
      }
    }

    if (graphiql) {
      app.get(
        graphiqlPath,
        bodyLimit({maxSize: maxRequestLength}),
        async (c) => {
          const digest = this.getDigest(c);
          const handlerResult = await this.graphiqlHandler(
            normalizeRequest(digest)
          );
          const result = await convertHandlerResultToResult(handlerResult);
          return this.send(result, c);
        }
      );
    }
    if (watch) {
      app.get(
        this.dynamicOptions.eventStreamPath,
        bodyLimit({maxSize: maxRequestLength}),
        async (c) => {
          const digest = this.getDigest(c);
          // TODO: refactor this to use the eventStreamHandler once we write that...
          const handlerResult: EventStreamHeandlerResult = {
            type: 'event-stream',
            request: normalizeRequest(digest),
            dynamicOptions: this.dynamicOptions,
            payload: this.makeStream(),
            statusCode: 200,
          };
          const result = await convertHandlerResultToResult(handlerResult);
          return this.send(result, c);
        }
      );
    }
  }
}

export function grafserv(config: GrafservConfig) {
  return new HonoGrafserv(config);
}
