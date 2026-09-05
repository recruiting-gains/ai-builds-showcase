import { describe, expect, it, vi } from 'vitest';
import * as workerEntrypoint from '../src/worker';
import { handleRequest, MAX_LAYOUT_BYTES } from '../src/server/handler';
import { validateLayout, WORKSPACE_PRESETS, type Layout } from '../src/shared/workspaces';

function layout(): Layout {
  const preset = WORKSPACE_PRESETS[0]!;
  return { version: 1, presetId: preset.id, cards: preset.cards.map(({ id, x, y }) => ({ id, x, y })) };
}

function assets() {
  return { fetch: vi.fn(async () => new Response('<!doctype html><title>Airframe</title>', { headers: { 'Content-Type': 'text/html', ETag: '"test"' } })) };
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://airframe.example${path}`, init);
}

function post(body: unknown): Request {
  return request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('workspace schema', () => {
  it('provides three predictable fictional workspaces with three valid cards each', () => {
    expect(WORKSPACE_PRESETS.map((preset) => preset.id)).toEqual(['mission-control', 'creative-studio', 'focus-desk']);
    for (const preset of WORKSPACE_PRESETS) {
      expect(preset.cards).toHaveLength(3);
      expect(new Set(preset.cards.map((card) => card.id)).size).toBe(3);
      for (const card of preset.cards) {
        // Coordinates describe available travel after subtracting the panel's
        // dimensions and canvas padding, so the full [0, 1] range is valid.
        // Browser checks separately verify actual rendered panel bounds.
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x).toBeLessThanOrEqual(1);
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.y).toBeLessThanOrEqual(1);
        expect(card.body).not.toMatch(/<[^>]+>/);
      }
    }
  });

  it('returns a new normalized layout without mutating its input', () => {
    const input = layout();
    input.cards[0]!.x = 0.123456;
    const result = validateLayout(input);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.message);
    expect(result.layout.cards[0]!.x).toBe(0.1235);
    expect(input.cards[0]!.x).toBe(0.123456);
    expect(result.layout).not.toBe(input);
  });

  it.each([null, [], 'layout', { ...layout(), version: 2 }, { ...layout(), presetId: 'unknown' }, { ...layout(), camera: 'not allowed' }, { ...layout(), cards: [] }])('rejects invalid layout shape %#', (input) => {
    expect(validateLayout(input).valid).toBe(false);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null])('rejects invalid coordinate %s', (coordinate) => {
    const input = layout();
    expect(validateLayout({ ...input, cards: input.cards.map((card, index) => index === 0 ? { ...card, x: coordinate } : card) }).valid).toBe(false);
  });

  it('accepts both coordinate boundaries', () => {
    const input = layout();
    input.cards[0]!.x = 0;
    input.cards[0]!.y = 1;
    expect(validateLayout(input).valid).toBe(true);
  });

  it('rejects missing, duplicate, foreign, or modified cards', () => {
    const input = layout();
    expect(validateLayout({ ...input, cards: input.cards.slice(0, 2) }).valid).toBe(false);
    expect(validateLayout({ ...input, cards: [input.cards[0], input.cards[0], input.cards[2]] }).valid).toBe(false);
    expect(validateLayout({ ...input, cards: input.cards.map((card, index) => index === 0 ? { ...card, id: 'creative-spark' } : card) }).valid).toBe(false);
    expect(validateLayout({ ...input, cards: input.cards.map((card) => ({ ...card, html: '<script>bad()</script>' })) }).valid).toBe(false);
  });
});

describe('Worker API and asset boundary', () => {
  it('exports only a runtime handler from the Worker entrypoint', () => {
    expect(Object.keys(workerEntrypoint)).toEqual(['default']);
    expect(typeof workerEntrypoint.default.fetch).toBe('function');
  });

  it('reports health without private identifiers or caching transient health', async () => {
    const response = await handleRequest(request('/api/health'), assets());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'airframe', version: 1, cameraProcessing: 'on-device', layoutStorage: 'none' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serves presets from the backend with short caching', async () => {
    const store = assets();
    const response = await handleRequest(request('/api/presets'), store);
    expect(await response.json()).toEqual({ presets: WORKSPACE_PRESETS });
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(store.fetch).not.toHaveBeenCalled();
  });

  it('validates a layout, returning only the validated data and no storage claim', async () => {
    const response = await handleRequest(post(layout()), assets());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, layout: layout() });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects schema errors with a readable structured error', async () => {
    const response = await handleRequest(post({ ...layout(), version: 2 }), assets());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_layout', message: expect.any(String) } });
  });

  it.each(['{broken', '', 'undefined'])('rejects malformed JSON %#', async (body) => {
    const response = await handleRequest(request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), assets());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_body' } });
  });

  it('rejects a false JSON content type', async () => {
    const response = await handleRequest(request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/jsonp' }, body: JSON.stringify(layout()) }), assets());
    expect(response.status).toBe(400);
  });

  it('allows the exact byte limit and rejects a one-byte excess without Content-Length', async () => {
    const body = JSON.stringify(layout());
    const allowed = body.padEnd(MAX_LAYOUT_BYTES, ' ');
    const makeRequest = (text: string) => request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
    expect(makeRequest(allowed).headers.has('Content-Length')).toBe(false);
    expect((await handleRequest(makeRequest(allowed), assets())).status).toBe(200);
    expect((await handleRequest(makeRequest(`${allowed} `), assets())).status).toBe(413);
  });

  it('rejects an oversized declared length early', async () => {
    const response = await handleRequest(request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '8193' }, body: '{}' }), assets());
    expect(response.status).toBe(413);
  });

  it('counts streamed UTF-8 bytes even when Content-Length lies', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('{"value":"'), encoder.encode('界'.repeat(2800)), encoder.encode('"}')];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '20' }, body: stream, duplex: 'half' };
    const response = await handleRequest(request('/api/layout/validate', init), assets());
    expect(response.status).toBe(413);
  });

  it('rejects malformed UTF-8 without leaking its body into errors', async () => {
    const response = await handleRequest(request('/api/layout/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([0xff, 0xfe]) }), assets());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'invalid_body', message: 'That file is not valid UTF-8 JSON.' } });
  });

  it.each(['/api', '/api/unknown', '/api/camera', '/api/control', '/api/layout/validate/'])('does not turn unknown API %s into HTML', async (path) => {
    const store = assets();
    const response = await handleRequest(request(path), store);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(store.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/health', 'POST', 'GET, HEAD'],
    ['/api/presets', 'DELETE', 'GET, HEAD'],
    ['/api/layout/validate', 'GET', 'POST'],
    ['/api/layout/validate', 'OPTIONS', 'POST'],
    ['/', 'POST', 'GET, HEAD'],
  ])('returns 405 and Allow for %s %s', async (path, method, allow) => {
    const response = await handleRequest(request(path, { method }), assets());
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe(allow);
  });

  it('keeps HEAD responses bodyless', async () => {
    for (const path of ['/', '/api/health', '/api/presets', '/api/unknown']) {
      const response = await handleRequest(request(path, { method: 'HEAD' }), assets());
      expect(await response.text()).toBe('');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  });

  it('forwards assets without buffering and revalidates HTML', async () => {
    const response = await handleRequest(request('/'), assets());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Airframe</title>');
    expect(response.headers.get('ETag')).toBe('"test"');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
  });

  it('preserves asset status, bytes, and cache headers', async () => {
    const response = await handleRequest(request('/model.task'), { fetch: async () => new Response('binary-chunk', { status: 206, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' } }) });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('binary-chunk');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('adds security and permission headers to successful and failing routes', async () => {
    for (const path of ['/', '/api/health', '/api/presets', '/api/missing']) {
      const response = await handleRequest(request(path), assets());
      const csp = response.headers.get('Content-Security-Policy')!;
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers.get('Permissions-Policy')).toContain('camera=(self), microphone=()');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
    }
  });

  it('returns a safe error if the assets binding fails', async () => {
    const response = await handleRequest(request('/'), { fetch: async () => { throw new Error('internal-secret-not-for-client'); } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('internal-secret');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
