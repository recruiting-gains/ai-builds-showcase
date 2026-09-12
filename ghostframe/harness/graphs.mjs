import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function projectGraph(projectDir) {
  const testFiles = (await fs.readdir(path.join(projectDir, 'tests'))).filter(name => name.endsWith('.test.ts')).sort().map(name => `tests/${name}`);
  const node = process.execPath;
  return {
    id: 'project-checks',
    inputs: ['src', 'tests', 'worker', 'harness', 'scripts', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'wrangler.jsonc', 'index.html'],
    nodes: [
      { id: 'tests', deps: [], idempotent: true, command: [node, 'node_modules/tsx/dist/cli.mjs', '--test', ...testFiles] },
      { id: 'typecheck', deps: [], idempotent: true, command: [node, 'node_modules/typescript/bin/tsc', '--noEmit'] },
      { id: 'worker-typecheck', deps: [], idempotent: true, command: [node, 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'worker/tsconfig.json'] },
      { id: 'asset-verification', deps: ['tests', 'typecheck', 'worker-typecheck'], idempotent: true, command: [node, 'scripts/prepare-assets.mjs'] },
      { id: 'build', deps: ['asset-verification'], idempotent: true, command: [node, 'node_modules/vite/bin/vite.js', 'build'] },
      { id: 'phone-browser', deps: ['build'], idempotent: true, timeoutMs: 180000, command: [node, 'scripts/verify-phone-studio.mjs'] },
      { id: 'deployment-dry-run', deps: ['build', 'phone-browser'], idempotent: true, command: [node, 'node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--outdir', '.harness/deployment-bundle'] },
      { id: 'publication', kind: 'external', deps: ['deployment-dry-run'], checks: ['github-source-verified', 'cloudflare-url-verified', 'assets-loaded'] },
      { id: 'webcam', kind: 'external', deps: ['publication'], checks: ['person-disappears-and-restores', 'portal-works', 'handframe-moves', 'short-pinch', 'long-pinch', 'camera-stops'] },
      { id: 'ai-still', kind: 'external', deps: ['publication'], checks: ['only-selected-still-submitted', 'returned-image-displayed'] },
    ],
  };
}

export async function demoGraph(projectDir, mode, repair = false, reset = false) {
  if (!['success', 'failure'].includes(mode)) throw new Error('Demo must be success or failure.');
  const folder = path.join(projectDir, '.harness', `demo-${mode}`);
  await fs.mkdir(folder, { recursive: true });
  const input = path.join(folder, 'input.json');
  try { await fs.access(input); }
  catch { await fs.writeFile(input, JSON.stringify({ ready: mode === 'success' }) + '\n'); }
  if (reset) await fs.writeFile(input, JSON.stringify({ ready: mode === 'success' }) + '\n');
  if (repair) await fs.writeFile(input, JSON.stringify({ ready: true }) + '\n');
  return {
    id: `demo-${mode}`, inputs: [path.relative(projectDir, input)],
    nodes: [
      { id: 'check', deps: [], idempotent: true, command: [process.execPath, '-e', `const fs=require('node:fs'); process.exit(JSON.parse(fs.readFileSync(${JSON.stringify(input)},'utf8')).ready?0:2);`] },
      { id: 'independent', deps: [], idempotent: true, command: [process.execPath, '-e', 'if (2 + 2 !== 4) process.exit(1);'] },
      { id: 'finish', deps: ['check', 'independent'], idempotent: true, command: [process.execPath, '-e', 'process.exit(0);'] },
    ],
  };
}
