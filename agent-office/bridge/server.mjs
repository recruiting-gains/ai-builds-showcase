import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  readFile,
  stat,
  realpath,
  mkdir,
  writeFile,
  chmod,
} from 'node:fs/promises';
import { resolve, sep, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfficeStore } from './state.mjs';

export function secretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function permittedRequest(req, origin) {
  return (
    req.headers.host === new URL(origin).host &&
    (!req.headers.origin || req.headers.origin === origin) &&
    (!req.headers['sec-fetch-site'] ||
      ['same-origin', 'none'].includes(req.headers['sec-fetch-site']))
  );
}
export async function startOffice({
  config = { allowedPaths: [], projects: [] },
  publicDir,
  port = 0,
  runtimeFile,
} = {}) {
  const store = new OfficeStore(config),
    token = randomBytes(32).toString('hex');
  const root = await realpath(publicDir);
  let origin;
  const json = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    if (!permittedRequest(req, origin))
      return json(res, 403, { error: 'Origin not allowed' });
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, origin).pathname);
    } catch {
      return json(res, 400, { error: 'Invalid path' });
    }
    if (path.startsWith('/api/')) {
      if (!secretEqual(req.headers.authorization, 'Bearer ' + token))
        return json(res, 401, { error: 'Local capability required' });
      if (path === '/api/status' && req.method === 'GET')
        return json(res, 200, store.snapshot());
      if (path === '/api/events' && req.method === 'POST') {
        if (!String(req.headers['content-type']).startsWith('application/json'))
          return json(res, 415, { error: 'JSON required' });
        let body = '',
          tooLarge = false;
        try {
          for await (const chunk of req) {
            if (!tooLarge) {
              body += chunk;
              if (body.length > 16384) {
                tooLarge = true;
                body = '';
              }
            }
          }
        } catch {
          if (!res.destroyed) json(res, 400, { error: 'Interrupted event' });
          return;
        }
        if (tooLarge) return json(res, 413, { error: 'Event too large' });
        try {
          const accepted = store.apply(JSON.parse(body));
          return json(res, accepted ? 202 : 400, { accepted });
        } catch {
          return json(res, 400, { error: 'Invalid event' });
        }
      }
      return json(res, 405, { error: 'Operation not supported' });
    }
    if (!['GET', 'HEAD'].includes(req.method))
      return json(res, 405, { error: 'Read only' });
    try {
      let candidate = resolve(
        root,
        '.' + (path === '/' ? '/index.html' : path),
      );
      if (!candidate.startsWith(root + sep))
        return json(res, 403, { error: 'Invalid path' });
      if ((await stat(candidate)).isDirectory())
        candidate = resolve(candidate, 'index.html');
      const actual = await realpath(candidate);
      if (!actual.startsWith(root + sep))
        return json(res, 403, { error: 'Invalid path' });
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.json': 'application/json',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(actual)] ?? 'application/octet-stream',
        'Cache-Control':
          extname(actual) === '.html' ? 'no-store' : 'public, max-age=3600',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(actual));
    } catch {
      json(res, 404, { error: 'Not found' });
    }
  });
  await new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(port, '127.0.0.1', ok);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  if (runtimeFile) {
    await mkdir(dirname(runtimeFile), { recursive: true, mode: 0o700 });
    await writeFile(runtimeFile, JSON.stringify({ origin, token }), {
      mode: 0o600,
    });
    await chmod(runtimeFile, 0o600);
  }
  return { server, store, origin, token };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  let config = { allowedPaths: [], projects: [] };
  try {
    config = JSON.parse(
      await readFile(
        process.env.AGENT_OFFICE_CONFIG ||
          resolve(here, '../office.local.json'),
        'utf8',
      ),
    );
  } catch {}
  const office = await startOffice({
    config,
    publicDir:
      process.env.AGENT_OFFICE_PUBLIC || resolve(here, '../dist/client'),
    runtimeFile: process.env.AGENT_OFFICE_RUNTIME,
    port: Number(process.env.AGENT_OFFICE_PORT || 0),
  });
  // Private parent-process handshake, consumed only by our native wrapper.
  process.stdout.write(
    JSON.stringify({
      ready: true,
      url: office.origin + '/#key=' + office.token,
    }) + '\n',
  );
  const stop = () => office.server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
