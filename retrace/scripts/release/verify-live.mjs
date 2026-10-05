import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { policy, sha256, commitId } from './policy.mjs';

const artifact = resolve(process.env.RETRACE_ARTIFACT || 'release-artifact');
const evidence = resolve(process.env.RETRACE_RELEASE_EVIDENCE || 'release-evidence');
const commit = commitId(process.env.RETRACE_COMMIT_SHA);
const manifest = JSON.parse(await readFile(resolve(artifact, 'release.json'), 'utf8'));
assert.equal(manifest.commit, commit);
assert.ok(!process.env.CLOUDFLARE_API_TOKEN, 'Public website verification must run without deployment credentials.');
await mkdir(evidence, { recursive: true });
const verified = [];
for (const [path, expected] of Object.entries(manifest.files)) {
  if (!path.startsWith('dist/')) continue;
  const url = new URL(path.slice(5), policy.productionUrl + '/');
  url.searchParams.set('release', commit);
  let matched = false;
  for (let attempt = 0; attempt < 5 && !matched; attempt++) {
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    matched = response.ok && bytes.length === expected.size && sha256(bytes) === expected.sha256;
    if (!matched && attempt < 4) await new Promise(r => setTimeout(r, 3000));
  }
  assert.ok(matched, `Published asset differs from reviewed build: ${path}. Inspect before considering rollback.`);
  verified.push(path);
}
const health = await fetch(policy.productionUrl + '/api/health', { signal: AbortSignal.timeout(15000) });
assert.equal(health.status, 200);
const status = await health.json();
assert.equal(status.service, 'ReTrace');
assert.equal(status.demo, 'simulation');
assert.equal(status.privateStream, 'configured', 'Existing private interface configuration was not preserved.');

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(policy.productionUrl + '/?reduced', { waitUntil: 'networkidle' });
    await expect(page.locator('.rt-renderer')).toHaveAttribute('data-model-ready', 'true', { timeout: 30000 });
    await page.getByRole('navigation', { name: 'Story chapters' }).locator('button').nth(2).click();
    await expect(page.locator('.rt-router-callout')).toHaveCSS('opacity', '1');
    await expect(page.locator('.rt-renderer')).toHaveAttribute('data-router-origin', '3.22,1.27,2.5');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: resolve(evidence, `${name}-production-router.png`) });
    await page.getByRole('navigation', { name: 'Story chapters' }).locator('button').nth(3).click();
    await page.getByRole('button', { name: 'Play simulated replay', exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Simulation time in seconds' }).inputValue())).toBeGreaterThan(17.4);
    await page.getByRole('button', { name: 'Pause simulated replay', exact: true }).click();
    await page.getByRole('link', { name: 'Open the full observatory', exact: true }).click({ trial: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
const reportPath = resolve(evidence, 'release-report.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
report.status = 'production-and-website-verified';
report.verifiedAssets = verified;
report.browserChecks = ['desktop', 'phone'];
report.productionUrl = policy.productionUrl;
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `\nProduction verified: ${policy.productionUrl}\n\nAll ${verified.length} assets match the reviewed build; desktop/mobile router and replay checks passed.\n`, { flag: 'a' });
console.log(`Verified production commit ${commit}: ${verified.length} assets plus desktop/mobile interactions.`);
