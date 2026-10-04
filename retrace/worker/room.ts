import { DurableObject } from "cloudflare:workers";
import type {
  ReceivedEvent,
  SignalEvent,
  SourceKind,
  StreamMessage,
} from "../shared/types";
import type { ViewerSession } from "./auth";
import { HttpError, selectEvents, type SequenceState } from "./protocol";

interface SocketState {
  session: ViewerSession;
  pending: number;
  epoch: string;
}
interface SequenceRow extends Record<string, string | number> {
  stream_key: string;
  sequence: number;
  source: SourceKind;
  touched: number;
}
const MAX_VIEWERS = 8;
const MAX_PENDING_BATCHES = 10;
const METADATA_TTL = 24 * 60 * 60 * 1000;

export class SignalRoom extends DurableObject<Env> {
  private readonly epoch = crypto.randomUUID();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Only control metadata is durable. Samples never enter storage or logs.
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sequences (stream_key TEXT PRIMARY KEY, sequence INTEGER NOT NULL, source TEXT NOT NULL, touched INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL)`,
    );
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS revoked (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)`,
    );
  }
  private spend(key: string, maximum: number, period: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM limits WHERE reset <= ?", now);
    const row = this.ctx.storage.sql
      .exec<{ count: number; reset: number }>(
        "SELECT count, reset FROM limits WHERE key = ?",
        key,
      )
      .toArray()[0];
    if (row && row.count >= maximum)
      throw new HttpError(
        429,
        "Rate limit reached. Try again shortly.",
        Math.max(1, Math.ceil((row.reset - now) / 1000)),
      );
    this.ctx.storage.sql.exec(
      "INSERT INTO limits (key,count,reset) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      now + period,
    );
  }
  async loginAttempt(
    fingerprint: string,
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    try {
      this.spend("login-total", 60, 60_000);
      this.spend(`login:${fingerprint}`, 8, 15 * 60_000);
      return { allowed: true };
    } catch (error) {
      if (error instanceof HttpError)
        return { allowed: false, retryAfter: error.retryAfter };
      throw error;
    }
  }
  async isRevoked(id: string) {
    this.ctx.storage.sql.exec(
      "DELETE FROM revoked WHERE expires <= ?",
      Math.floor(Date.now() / 1000),
    );
    return (
      this.ctx.storage.sql
        .exec("SELECT id FROM revoked WHERE id = ?", id)
        .toArray().length > 0
    );
  }
  async revoke(session: ViewerSession) {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO revoked (id,expires) VALUES (?,?)",
      session.id,
      session.expires,
    );
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as SocketState;
      if (state.session.id === session.id) this.disconnect(ws, "Signed out");
    }
  }
  private send(ws: WebSocket, message: StreamMessage) {
    ws.send(JSON.stringify(message));
  }
  private disconnect(ws: WebSocket, reason: string) {
    // Explicit protocol state also covers intermediaries that delay a close handshake.
    if (ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    this.send(ws, {
      type: "status",
      status: "disconnected",
      epoch: this.epoch,
    });
    ws.close(1008, reason);
  }
  private refreshEpoch(ws: WebSocket, state: SocketState) {
    if (state.epoch === this.epoch) return;
    this.send(ws, { type: "status", status: "waiting", epoch: this.epoch });
    state.epoch = this.epoch;
    ws.serializeAttachment(state);
  }
  private expire(ws: WebSocket, state: SocketState): boolean {
    if (state.session.expires * 1000 > Date.now()) return false;
    this.disconnect(ws, "Viewer session expired");
    return true;
  }
  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade responses must cross the fetch boundary, not RPC serialization.
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    let session: ViewerSession;
    try {
      session = JSON.parse(request.headers.get("X-Retrace-Session") ?? "null");
      if (
        !session ||
        typeof session.id !== "string" ||
        !Number.isInteger(session.expires)
      )
        throw new Error();
    } catch {
      return Response.json(
        { error: "Viewer login required." },
        { status: 401 },
      );
    }
    return this.open(session);
  }
  private async open(session: ViewerSession): Promise<Response> {
    if (
      session.expires * 1000 <= Date.now() ||
      (await this.isRevoked(session.id))
    )
      return Response.json(
        { error: "Viewer session expired." },
        { status: 401 },
      );
    if (this.ctx.getWebSockets().length >= MAX_VIEWERS)
      return Response.json(
        { error: "Viewer limit reached." },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      session,
      pending: 0,
      epoch: this.epoch,
    } satisfies SocketState);
    this.send(server, { type: "status", status: "waiting", epoch: this.epoch });
    await this.scheduleExpiry();
    return new Response(null, { status: 101, webSocket: client });
  }
  async ingest(events: SignalEvent[]): Promise<{
    accepted: number;
    dropped: number;
    epoch: string;
    status?: number;
    error?: string;
    retryAfter?: number;
  }> {
    try {
      this.spend("ingest", 10, 1000);
      const now = Date.now();
      const rows = this.ctx.storage.sql
        .exec<SequenceRow>(
          "SELECT * FROM sequences WHERE touched >= ?",
          now - METADATA_TTL,
        )
        .toArray();
      const existing = new Map<string, SequenceState>(
        rows.map((row) => [
          row.stream_key,
          { sequence: row.sequence, source: row.source },
        ]),
      );
      const result = selectEvents(events, existing);
      if (result.next.size > 1024)
        throw new HttpError(429, "Stream metadata limit reached.", 3600);
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "DELETE FROM sequences WHERE touched < ?",
          now - METADATA_TTL,
        );
        for (const event of result.accepted)
          this.ctx.storage.sql.exec(
            "INSERT INTO sequences (stream_key,sequence,source,touched) VALUES (?,?,?,?) ON CONFLICT(stream_key) DO UPDATE SET sequence=excluded.sequence,touched=excluded.touched",
            `${event.sessionId}:${event.sensorId}`,
            event.sequence,
            event.sourceKind,
            now,
          );
      });
      const received: ReceivedEvent[] = result.accepted.map((event) => ({
        ...event,
        receivedAt: new Date(now).toISOString(),
      }));
      if (received.length)
        for (const ws of this.ctx.getWebSockets()) {
          const state = ws.deserializeAttachment() as SocketState;
          if (this.expire(ws, state)) continue;
          try {
            this.refreshEpoch(ws, state);
            if (state.pending >= MAX_PENDING_BATCHES) {
              this.disconnect(
                ws,
                "Viewer is too slow. Reconnect to resume fresh samples.",
              );
              continue;
            }
            this.send(ws, { type: "samples", events: received });
            state.pending += 1;
            ws.serializeAttachment(state);
          } catch {
            ws.close(1011, "Stream unavailable");
          }
        }
      return {
        accepted: received.length,
        dropped: result.dropped,
        epoch: this.epoch,
      };
    } catch (error) {
      if (error instanceof HttpError)
        return {
          accepted: 0,
          dropped: 0,
          epoch: this.epoch,
          status: error.status,
          error: error.message,
          retryAfter: error.retryAfter,
        };
      throw error;
    }
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const state = ws.deserializeAttachment() as SocketState;
    if (this.expire(ws, state)) return;
    this.refreshEpoch(ws, state);
    if (typeof message !== "string" || message.length > 64) {
      ws.close(1008, "Only acknowledgments are accepted");
      return;
    }
    try {
      const value = JSON.parse(message) as { type?: unknown };
      if (!value || value.type !== "ack" || Object.keys(value).length !== 1)
        throw new Error();
      state.pending = Math.max(0, state.pending - 1);
      ws.serializeAttachment(state);
    } catch {
      ws.close(1008, "Only acknowledgments are accepted");
    }
  }
  webSocketClose(ws: WebSocket, code: number) {
    // Current compatibility dates auto-reply before invoking this handler.
    // Older runtimes may still require a reply; reserved observation codes
    // (notably 1005 from close() without a status) must never go on the wire.
    if (ws.readyState === WebSocket.READY_STATE_CLOSED) return;
    const validCode =
      code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code);
    ws.close(validCode ? code : 1000);
  }
  webSocketError(ws: WebSocket) {
    ws.close(1011, "Stream unavailable");
  }
  private async scheduleExpiry() {
    const expiration = this.ctx
      .getWebSockets()
      .map(
        (ws) =>
          (ws.deserializeAttachment() as SocketState).session.expires * 1000,
      )
      .filter((time) => time > Date.now());
    if (expiration.length)
      await this.ctx.storage.setAlarm(Math.min(...expiration));
  }
  async alarm() {
    for (const ws of this.ctx.getWebSockets())
      this.expire(ws, ws.deserializeAttachment() as SocketState);
    await this.scheduleExpiry();
  }
}
