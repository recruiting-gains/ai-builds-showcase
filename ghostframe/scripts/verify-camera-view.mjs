// Run the saved-clip acceptance check against a fixed build, never an HMR session.
import { spawn } from 'node:child_process';
const root = new URL('../', import.meta.url), base = 'http://127.0.0.1:8809';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '8809', '--strictPort'], { cwd: root, stdio: ['ignore','pipe','pipe'] });
let child, log = '';
server.stdout.on('data', chunk => log += chunk); server.stderr.on('data', chunk => log += chunk);
const deadline = setTimeout(() => { child?.kill('SIGTERM'); server.kill('SIGTERM'); process.exitCode = 1; }, 200000);
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error(`Camera view preview exited: ${log}`);
    try { const response = await fetch(base, { signal: AbortSignal.timeout(500) }); if (response.ok) { ready = true; break; } } catch { /* bounded local readiness */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Camera view preview was not ready: ${log}`);
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/camera-view-browser-check.mjs', base], { cwd: root, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
} catch (error) { console.error(error); process.exitCode = 1; }
finally { clearTimeout(deadline); child?.kill('SIGTERM'); server.kill('SIGTERM'); }
