import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('the install manifest is a standalone phone app with local icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.orientation, 'any');
  assert.ok(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon: { sizes: string }) => icon.sizes === '512x512'));
  for (const icon of manifest.icons) assert.match(icon.src, /^\//);
  const page = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(page, /rel="manifest"/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /apple-mobile-web-app-capable/);
});

test('the service worker never caches API calls or leaves the origin', () => {
  const source = readFileSync(new URL('public/sw.js', root), 'utf8');
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /request\.method !== 'GET'/);
  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(source, /https?:\/\/(?!self)/);
  assert.match(readFileSync(new URL('src/pwa.ts', root), 'utf8'), /webdriver/);
});
