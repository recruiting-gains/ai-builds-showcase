import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOffice } from '../bridge/server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.deepEqual(
  await readFile(resolve(root, '.openai/hosting.json')),
  await readFile(resolve(root, 'dist/.openai/hosting.json')),
);
const office = await startOffice({ publicDir: resolve(root, 'dist/client') });
try {
  const response = await fetch(office.origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  const html = await response.text();
  assert.match(html, /Agent Office/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Geist(?:&amp;|&)display=swap/);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Geist\+Mono(?:&amp;|&)display=swap/);
  const assets = new Set([...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'))
    .filter((path) => path.startsWith('/') && !path.startsWith('//')));
  assert.ok([...assets].some((path) => /\.js(?:\?|$)/.test(path)), 'Export must include client JavaScript');
  assert.ok([...assets].some((path) => /\.css(?:\?|$)/.test(path)), 'Export must include styles');
  for (const path of assets) {
    const asset = await fetch(new URL(path, office.origin));
    assert.equal(asset.status, 200, `Missing built asset: ${path}`);
    if (/\.js(?:\?|$)/.test(path)) assert.match(asset.headers.get('content-type'), /javascript/);
    if (/\.css(?:\?|$)/.test(path)) assert.match(asset.headers.get('content-type'), /text\/css/);
    await asset.arrayBuffer();
  }
  assert.equal((await fetch(`${office.origin}/api/status`)).status, 401);
  const headers = { authorization: `Bearer ${office.token}` };
  assert.equal((await fetch(`${office.origin}/api/status`, { headers })).status, 200);
  assert.equal((await fetch(`${office.origin}/api/status`, {
    headers: { ...headers, origin: 'https://untrusted.example' },
  })).status, 403);
  assert.equal((await fetch(`${office.origin}/api/execute`, { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(`${office.origin}/.openai/hosting.json`)).status, 404);
  console.log(JSON.stringify({ staticAssets: assets.size, metadataPreserved: true, bridgeGuards: 'passed' }));
} finally {
  office.server.closeAllConnections();
  await new Promise((done) => office.server.close(done));
}
