import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageStatic } from '../scripts/package-static.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'office-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'out', '_next', 'static'), { recursive: true });
  await mkdir(join(root, '.openai'));
  await writeFile(join(root, 'out', 'index.html'), '<h1>Office fixture</h1>');
  await writeFile(join(root, 'out', '_next', 'static', 'page.js'), 'export {};');
  await writeFile(join(root, '.openai', 'hosting.json'), JSON.stringify({
    project_id: 'fixture-only', static: { directory: 'dist/client' }, d1: null, r2: null,
  }));
  return root;
}

test('packaging preserves static bytes and Sites metadata without publishing the bridge', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'bridge'));
  await writeFile(join(root, 'bridge', 'server.mjs'), '// fixture-only private server');
  await mkdir(join(root, 'drizzle'));
  await writeFile(join(root, 'drizzle', 'schema.sql'), '-- fixture schema');
  await mkdir(join(root, 'dist', 'client'), { recursive: true });
  await writeFile(join(root, 'dist', 'client', 'stale.js'), 'stale');
  await packageStatic(root);
  assert.deepEqual(await readFile(join(root, 'dist/client/index.html')), await readFile(join(root, 'out/index.html')));
  assert.deepEqual(await readFile(join(root, 'dist/client/_next/static/page.js')), await readFile(join(root, 'out/_next/static/page.js')));
  assert.deepEqual(await readFile(join(root, 'dist/.openai/hosting.json')), await readFile(join(root, '.openai/hosting.json')));
  assert.equal(await readFile(join(root, 'dist/.openai/drizzle/schema.sql'), 'utf8'), '-- fixture schema');
  for (const path of ['stale.js', 'bridge/server.mjs', '.openai/hosting.json', 'drizzle/schema.sql']) {
    await assert.rejects(readFile(join(root, 'dist/client', path)), { code: 'ENOENT' });
  }
});

test('packaging rejects private files before replacing an existing export', async (t) => {
  for (const name of ['office.local.json', '.env.local', '.office-state']) {
    await t.test(name, async (child) => {
      const root = await fixture(child);
      await mkdir(join(root, 'dist/client'), { recursive: true });
      await writeFile(join(root, 'dist/client/index.html'), 'last known build');
      await writeFile(join(root, 'out', name), 'fixture-only');
      await assert.rejects(packageStatic(root), /Unexpected private or linked entry/);
      assert.equal(await readFile(join(root, 'dist/client/index.html'), 'utf8'), 'last known build');
    });
  }
});

test('packaging rejects links and incompatible static manifests', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'private.txt'), 'fixture-only');
  await symlink(join(root, 'private.txt'), join(root, 'out', 'linked.txt'));
  await assert.rejects(packageStatic(root), /Unexpected private or linked entry/);
  await rm(join(root, 'out', 'linked.txt'));
  for (const config of [
    { static: { directory: 'out' } },
    { static: { directory: 'dist/client' }, d1: 'unexpected-binding' },
  ]) {
    await writeFile(join(root, '.openai/hosting.json'), JSON.stringify(config));
    await assert.rejects(packageStatic(root), /Static packaging requires/);
  }
});

test('the retained shadcn stylesheet and license are byte-identical to 4.18.0', async () => {
  for (const [name, digest] of [
    ['tailwind.css', 'bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a'],
    ['LICENSE.md', '1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f'],
  ]) {
    const bytes = await readFile(new URL(`../app/vendor/shadcn/${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
  }
});
