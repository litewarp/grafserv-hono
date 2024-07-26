interface BunServerWebSocket<T> {
  send(data: string | ArrayBufferLike, compress?: boolean): void;
  close(code?: number, reason?: string): void;
  data: T;
  readyState: 0 | 1 | 2 | 3;
}
export interface BunWebSocketHandler<T> {
  open(ws: BunServerWebSocket<T>): void;
  close(ws: BunServerWebSocket<T>, code?: number, reason?: string): void;
  message(ws: BunServerWebSocket<T>, message: string | Uint8Array): void;
}

export interface BunWebSocketData {
  connId: number;
  url: URL;
  protocol: string;
}

export interface WsClient {
  handleMessage: (data: string) => void;
  closed: (code: number, reason: string) => void;
}
