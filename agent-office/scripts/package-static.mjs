import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only Next's export becomes public. The bridge and Sites metadata stay outside it.
async function checkExport(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.isSymbolicLink() ||
      entry.name.startsWith('.env') ||
      entry.name.endsWith('.local.json') ||
      ['.openai', '.office-state', 'bridge', 'native'].includes(entry.name)
    ) {
      throw new Error(`Unexpected private or linked entry in static export: ${entry.name}`);
    }
    if (entry.isDirectory()) await checkExport(path);
  }
}

export async function packageStatic(projectRoot) {
  const root = resolve(projectRoot);
  const output = join(root, 'out');
  const dist = join(root, 'dist');
  const staging = join(dist, '.static-stage');
  const manifest = join(root, '.openai', 'hosting.json');
  const config = JSON.parse(await readFile(manifest, 'utf8'));
  if (config.static?.directory !== 'dist/client' || config.d1 || config.r2) {
    throw new Error('Static packaging requires dist/client with no runtime storage bindings');
  }
  if (!(await lstat(output)).isDirectory() || !(await lstat(join(output, 'index.html'))).isFile()) {
    throw new Error('Build the Next static export before packaging');
  }
  await checkExport(output);
  await mkdir(dist, { recursive: true });
  await rm(staging, { recursive: true, force: true });
  try {
    await mkdir(join(staging, '.openai'), { recursive: true });
    await cp(output, join(staging, 'client'), { recursive: true });
    await cp(manifest, join(staging, '.openai', 'hosting.json'));
    // Matches the previous Sites build integration, outside the public directory.
    try {
      await cp(join(root, 'drizzle'), join(staging, '.openai', 'drizzle'), { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rm(join(dist, 'client'), { recursive: true, force: true });
    await rename(join(staging, 'client'), join(dist, 'client'));
    await rm(join(dist, '.openai'), { recursive: true, force: true });
    await rename(join(staging, '.openai'), join(dist, '.openai'));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await packageStatic(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log('Static demo packaged in dist/client; Sites metadata retained in dist/.openai.');
}
