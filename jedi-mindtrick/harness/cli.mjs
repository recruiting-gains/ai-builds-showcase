#!/usr/bin/env node
import path from 'node:path';
import { runGraph } from './runner.mjs';
import { demoGraph, projectGraph } from './graphs.mjs';

const args = process.argv.slice(2);
const options = { evidence: {} };
try {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--new') options.newRun = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--repair-demo') options.repair = true;
    else if (['--demo', '--retry', '--reason', '--ack-interrupted', '--evidence'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--evidence') {
        const split = value.indexOf('='); if (split < 1) throw new Error('Use --evidence gate=path.json.');
        options.evidence[value.slice(0, split)] = path.resolve(value.slice(split + 1));
      } else options[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${arg}.`);
  }
  if (options.newRun && options.resume) throw new Error('Choose --new or --resume.');
  if (options.repair && (!options.demo || options.demo !== 'failure' || !options.resume || !options.retry)) throw new Error('--repair-demo requires --demo failure --resume --retry check and a reason.');
  if ((options.retry || options['ack-interrupted']) && !options.resume) throw new Error('Corrections and interruption acknowledgments require --resume.');
  const projectDir = process.cwd();
  const graph = options.demo ? await demoGraph(projectDir, options.demo, options.repair, options.newRun) : await projectGraph(projectDir);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let result;
  try {
    result = await runGraph({ graph, projectDir, newRun: options.newRun, resume: options.resume,
      retry: options.retry ? { nodeId: options.retry, reason: options.reason } : undefined,
      acknowledgeInterrupted: options['ack-interrupted'] ? { nodeId: options['ack-interrupted'], reason: options.reason } : undefined,
      evidence: options.evidence, signal: controller.signal });
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
  const { state } = result;
  console.log(JSON.stringify({ runId: state.runId, status: state.status, reason: state.reason, steps: state.steps,
    activeElapsedMs: Math.round(state.activeElapsedMs), sourceFingerprint: state.sourceFingerprint,
    nodes: Object.fromEntries(Object.entries(state.nodes).map(([id, record]) => [id, { status: record.status, attempts: record.attempts }])),
    checkpoint: path.relative(projectDir, path.join(result.runDir, 'checkpoint.json')) }, null, 2));
  process.exitCode = state.status === 'complete' ? 0 : state.status === 'awaiting-evidence' ? 3 : 2;
} catch (error) {
  console.error(`Harness stopped: ${error.message}`);
  process.exitCode = 2;
}
