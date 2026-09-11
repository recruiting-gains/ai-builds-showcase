import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';
import type { RenderInput } from '../worker/validation.ts';

// Executes actual Worker/ledger source. Only the platform base and remote AI are
// replaced; SQL statements execute against a real, isolated in-memory SQLite DB.
// This is not a Cloudflare deployment test, browser test or live model invocation.
type Ledger = { render(input: RenderInput): Promise<Response>; alarm(): Promise<void> };
type WorkerModule = {
  RenderLedger: new (ctx: unknown, env: unknown) => Ledger;
  default: { fetch(request: Request, env: unknown): Promise<Response> };
};
const bundled = await build({
  entryPoints: [new URL('../worker/index.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'mock-platform-base', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'base', namespace: 'test-platform' }));
    build.onLoad({ filter: /.*/, namespace: 'test-platform' }, () => ({
      contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', loader: 'js',
    }));
  } }],
});
const worker = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`) as WorkerModule;

function chunk(kind: string, payload: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(kind), payload]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(payload.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
  chunk('tEXt', Buffer.from('Description\0Synthetic test pixel, never a camera frame')),
  chunk('IDAT', deflateSync(Buffer.from([0, 80, 120, 180, 255]))), chunk('IEND', Buffer.alloc(0)),
]);
const imageStream = () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(png); controller.close(); } });
const input = (createdAt = Date.now()): RenderInput => ({ requestId: crypto.randomUUID(), createdAt, style: 'ink', image: png.toString('base64') });

function fixture(provider: (signal: AbortSignal) => Promise<ReadableStream<Uint8Array>> = async () => imageStream()) {
  const db = new DatabaseSync(':memory:');
  const alarms: number[] = [], names: string[] = [];
  let calls = 0;
  const ctx = { storage: {
    sql: { exec(query: string, ...values: Array<string | number | null>) {
      const statement = db.prepare(query);
      const rows = /^\s*SELECT\b/i.test(query) ? statement.all(...values) : (statement.run(...values), []);
      return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
    } },
    setAlarm: async (at: number) => { alarms.push(at); },
  } };
  const env = {
    AI_RENDER_ENABLED: 'true',
    AI: { run: async (_model: string, _values: unknown, options: { signal: AbortSignal }) => { calls++; return provider(options.signal); } },
    RENDER_LEDGER: { getByName(name: string): Ledger { names.push(name); return ledger; } },
    ASSETS: { fetch: async () => new Response('fixture asset') },
  };
  const ledger = new worker.RenderLedger(ctx, env);
  return { db, env, ledger, alarms, names, calls: () => calls, close: () => db.close() };
}

function request(body: RenderInput, headers: Record<string, string> = {}) {
  return new Request('https://jedi.example/api/render', { method: 'POST', headers: {
    Origin: 'https://jedi.example', 'Content-Type': 'application/json', ...headers,
  }, body: JSON.stringify(body) });
}

test('real Worker route returns the provider PNG while ledger persists metadata only', async () => {
  const f = fixture();
  try {
    const selected = input();
    const response = await worker.default.fetch(request(selected), f.env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/png');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(png));
    assert.equal(f.calls(), 1);
    const row = f.db.prepare('SELECT * FROM requests').get()!;
    assert.equal(row.id, selected.requestId);
    assert.equal(row.status, 'complete');
    assert.match(String(row.hash), /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(row).sort(), ['created', 'hash', 'id', 'status']);
  } finally { f.close(); }
});

test('simultaneous same-ID submissions invoke AI once and reject the duplicate', async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async () => { entered(); await wait; return imageStream(); });
  try {
    const selected = input();
    const first = f.ledger.render(selected);
    await ready;
    const second = await f.ledger.render(selected);
    assert.equal(second.status, 409);
    assert.equal(f.calls(), 1);
    release();
    assert.equal((await first).status, 200);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM requests').get()!.n, 1);
  } finally { release?.(); f.close(); }
});

test('reusing an ID with another style or image rejects the conflicting request', async () => {
  const f = fixture();
  try {
    const selected = input();
    assert.equal((await f.ledger.render(selected)).status, 200);
    assert.equal((await f.ledger.render({ ...selected, style: 'neon' })).status, 409);
    assert.equal((await f.ledger.render({ ...selected, image: selected.image + 'AAAA' })).status, 409);
    assert.equal(f.calls(), 1);
  } finally { f.close(); }
});

test('provider failure stays claimed and cannot cause another inference on retry', async () => {
  const f = fixture(async () => { throw new Error('injected provider failure'); });
  try {
    const selected = input();
    assert.equal((await f.ledger.render(selected)).status, 502);
    assert.equal((await f.ledger.render(selected)).status, 409);
    assert.equal(f.calls(), 1);
    assert.equal(f.db.prepare('SELECT status FROM requests').get()!.status, 'unknown-or-failed');
  } finally { f.close(); }
});

test('the 45-second timeout aborts provider work and preserves the ambiguous claim', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const f = fixture(signal => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted test provider')); }, { once: true });
    entered();
  }));
  try {
    const selected = input();
    const pending = f.ledger.render(selected);
    await ready;
    t.mock.timers.tick(45_000);
    assert.equal((await pending).status, 502);
    assert.equal(aborted, true);
    assert.equal((await f.ledger.render(selected)).status, 409);
    assert.equal(f.calls(), 1);
    assert.equal(f.db.prepare('SELECT status FROM requests').get()!.status, 'unknown-or-failed');
  } finally { t.mock.timers.reset(); f.close(); }
});

test('the shared 20-call budget blocks a 21st unique request before inference', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 20; i++) assert.equal((await f.ledger.render(input())).status, 200);
    assert.equal((await f.ledger.render(input())).status, 429);
    assert.equal(f.calls(), 20);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM requests').get()!.n, 20);
  } finally { f.close(); }
});

test('a client timestamp straddling midnight still reaches one ledger and one request claim', async () => {
  const savedNow = Date.now;
  const midnight = Date.parse('2026-09-11T00:00:00Z');
  Date.now = () => midnight;
  const f = fixture();
  try {
    const selected = input(midnight - 30_000);
    assert.equal((await worker.default.fetch(request(selected), f.env)).status, 200);
    assert.equal((await worker.default.fetch(request({ ...selected, createdAt: midnight + 30_000 }), f.env)).status, 409);
    assert.deepEqual(f.names, ['preview-budget-v1', 'preview-budget-v1']);
    assert.equal(f.calls(), 1);
    assert.equal(f.db.prepare('SELECT created FROM requests').get()!.created, midnight);
  } finally { Date.now = savedNow; f.close(); }
});

test('an expired-row alarm preserves recent claims and leaves the table usable', async () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run('old', 'hash', 'complete', now - 49 * 3_600_000);
    f.db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run('recent', 'hash', 'submitted', now - 1000);
    await f.ledger.alarm();
    assert.deepEqual(f.db.prepare('SELECT id FROM requests').all().map(row => row.id), ['recent']);
    assert.equal(f.alarms.length, 1);
    assert.ok(f.alarms[0] > now);
    assert.equal((await f.ledger.render(input())).status, 200);
    f.db.prepare('DELETE FROM requests').run();
    await f.ledger.alarm();
    assert.equal((await f.ledger.render(input())).status, 200);
  } finally { f.close(); }
});

test('origin and exact JSON media-type checks reject input before ledger or AI access', async () => {
  const f = fixture();
  try {
    assert.equal((await worker.default.fetch(request(input(), { Origin: 'https://other.example' }), f.env)).status, 403);
    assert.equal((await worker.default.fetch(request(input(), { 'Content-Type': 'application/jsonp' }), f.env)).status, 415);
    assert.equal(f.names.length, 0);
    assert.equal(f.calls(), 0);
  } finally { f.close(); }
});
