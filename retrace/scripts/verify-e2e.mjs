import { spawn } from "node:child_process";
const port = 8794;
const server = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { stdio: ["ignore", "pipe", "pipe"], detached: true },
);
server.stdout.resume();
server.stderr.resume();
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw new Error("Local Worker did not start.");
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/verify-browser.mjs"], {
      stdio: "inherit",
      env: { ...process.env, RETRACE_URL: `http://127.0.0.1:${port}` },
    });
    child.on("exit", resolve);
  });
  if (code !== 0) process.exitCode = 1;
} finally {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
}
