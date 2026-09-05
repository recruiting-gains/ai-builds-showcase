import { readFile } from 'node:fs/promises';
import { sanitizeHook } from './state.mjs';
// Fixed allowlist, bounded stdin, silent success: this observer never affects a task.
try {
  const cfgPath = process.argv[2],
    runtimePath = process.argv[3];
  const config = JSON.parse(await readFile(cfgPath, 'utf8'));
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1_000_000) throw Error('oversized');
  }
  const raw = JSON.parse(input),
    safe = sanitizeHook(raw, config.allowedPaths ?? []);
  if (safe) {
    const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.origin) ||
      !/^[a-f0-9]{64}$/.test(runtime.token)
    )
      throw Error('invalid runtime');
    // Forward only whitelisted metadata. Even raw tool output never leaves this process.
    const body = {
      cwd: raw.cwd,
      session_id: safe.sessionId,
      hook_event_name: safe.event,
      ...(safe.agentId ? { agent_id: safe.agentId } : {}),
      ...(safe.failed ? { tool_response: { isError: true } } : {}),
    };
    await fetch(runtime.origin + '/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + runtime.token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(350),
    });
  }
} catch {}
process.stdout.write('{}\n');
