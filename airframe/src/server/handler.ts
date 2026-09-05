import { validateLayout, WORKSPACE_PRESETS } from '../shared/workspaces';

export const MAX_LAYOUT_BYTES = 8 * 1024;

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), display-capture=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

function secure(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function failure(code: string, message: string, status: number, headers: HeadersInit = {}): Response {
  return json({ error: { code, message } }, status, headers);
}

function methodNotAllowed(allowed: string): Response {
  return failure('method_not_allowed', 'That method is not supported here.', 405, { Allow: allowed });
}

class RequestBodyError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new RequestBodyError(400, 'invalid_body', 'The request length is invalid.');
  }
  if (length !== null && Number(length) > MAX_LAYOUT_BYTES) {
    throw new RequestBodyError(413, 'body_too_large', 'Keep layout files under 8 KB.');
  }
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new RequestBodyError(400, 'invalid_body', 'Send the layout as application/json.');
  }
  if (!request.body) throw new RequestBodyError(400, 'invalid_body', 'The layout is missing.');

  // Content-Length is only an early rejection. Actual streamed bytes enforce the limit.
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_LAYOUT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError(413, 'body_too_large', 'Keep layout files under 8 KB.');
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, 'invalid_body', 'That file is not valid UTF-8 JSON.');
  } finally {
    reader.releaseLock();
  }
}

async function api(request: Request, pathname: string): Promise<Response> {
  if (pathname === '/api/health') {
    if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
    return json({ status: 'ok', service: 'airframe', version: 1, cameraProcessing: 'on-device', layoutStorage: 'none' });
  }
  if (pathname === '/api/presets') {
    if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed('GET, HEAD');
    return json({ presets: WORKSPACE_PRESETS }, 200, { 'Cache-Control': 'public, max-age=300' });
  }
  if (pathname === '/api/layout/validate') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const result = validateLayout(await readBoundedJson(request));
    if (!result.valid) return failure('invalid_layout', result.message, 400);
    return json(result);
  }
  return failure('not_found', 'There is no API at this address.', 404);
}

// A narrow type taken from generated Env keeps the HTTP boundary easy to unit test.
export async function handleRequest(request: Request, assets: Pick<Env['ASSETS'], 'fetch'>): Promise<Response> {
  const { pathname } = new URL(request.url);
  try {
    let response: Response;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      response = await api(request, pathname);
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      response = methodNotAllowed('GET, HEAD');
    } else {
      response = await assets.fetch(request);
      // Revalidate HTML so new releases do not leave old model/bundle URLs in a tab.
      if (response.headers.get('Content-Type')?.includes('text/html')) {
        response = new Response(response.body, response);
        response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    }
    return secure(response, request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return secure(failure(error.code, error.message, error.status), request);
    }
    // No request body, landmarks, or camera data are logged or sent elsewhere.
    return secure(failure('unavailable', 'Airframe is temporarily unavailable. Please try again.', 503), request);
  }
}
