import { CASES, CORPUS_HASH, CORPUS_VERSION } from "../shared/corpus";
import {
  MODEL,
  type ExperimentRun,
  type TrialResult,
} from "../shared/contracts";
import { EXPERIMENT_FINGERPRINT } from "../shared/experiment";
import { HttpError } from "./http";
import { failedTrial, infer, STEP_LEASE_MS } from "./inference";

interface RunRow {
  id: string;
  session_hash: string;
  idempotency_key: string;
  created_at: number;
  expires_at: number;
  quota_day: string;
  prompt_a: string;
  prompt_b: string;
  model: string;
  corpus_version: string;
  corpus_hash: string;
  experiment_version: string;
}
interface StepRow {
  run_id: string;
  case_index: number;
  status: "pending" | "done";
  lease_token: string;
  started_at: number;
  quota_day: string;
  result_a: string | null;
  result_b: string | null;
}
export interface CreateInput {
  promptA: string;
  promptB: string;
  idempotencyKey: string;
}

export async function createRun(
  db: D1Database,
  owner: string,
  input: CreateInput,
): Promise<ExperimentRun> {
  const existing = await findIdempotent(db, owner, input.idempotencyKey);
  if (existing) return existingRun(db, existing, input);
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO runs
      (id, session_hash, idempotency_key, created_at, expires_at, quota_day, prompt_a, prompt_b, model, corpus_version, corpus_hash, experiment_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        owner,
        input.idempotencyKey,
        now,
        now + 86_400_000,
        utcDay(now),
        input.promptA,
        input.promptB,
        MODEL,
        CORPUS_VERSION,
        CORPUS_HASH,
        EXPERIMENT_FINGERPRINT,
      )
      .run();
  } catch (error) {
    // A concurrent duplicate create may win between lookup and insert. Reuse it
    // even when it consumed the last quota slot; never charge a second run.
    const concurrent = await findIdempotent(db, owner, input.idempotencyKey);
    if (concurrent) return existingRun(db, concurrent, input);
    throwQuotaError(error);
    throw error;
  }
  return getRun(db, owner, id);
}

export async function getRun(
  db: D1Database,
  owner: string,
  id: string,
): Promise<ExperimentRun> {
  const row = await ownedRow(db, owner, id);
  if (!currentExperiment(row)) {
    throw new HttpError(
      409,
      "This saved experiment uses an older setup. Start a fresh run with the current test set.",
    );
  }
  return snapshot(db, row);
}

export async function stepRun(
  env: Env,
  owner: string,
  id: string,
): Promise<ExperimentRun> {
  const row = await ownedRow(env.DB, owner, id);
  if (!currentExperiment(row)) {
    throw new HttpError(
      409,
      "The experiment version has changed. Start a new run so both prompts use the same setup.",
    );
  }
  const steps = await getSteps(env.DB, id);
  const pending = steps.find((step) => step.status === "pending");
  if (pending) {
    if (Date.now() - pending.started_at >= STEP_LEASE_MS) {
      const testCase = CASES[pending.case_index];
      const message =
        "This attempt was interrupted. It was reserved and will not be retried automatically or included in scoring.";
      await finishStep(
        env.DB,
        pending,
        failedTrial(testCase, "A", message),
        failedTrial(testCase, "B", message),
      );
    }
    return snapshot(env.DB, row);
  }
  const nextIndex = steps.length;
  if (nextIndex >= CASES.length) return snapshot(env.DB, row);

  const now = Date.now();
  const lease = crypto.randomUUID();
  let claimed: { lease_token: string } | null;
  try {
    // Atomic claim: exactly one caller can reserve this case. A repeated or
    // concurrent request only receives the current snapshot, never extra calls.
    claimed = await env.DB.prepare(
      `INSERT OR IGNORE INTO steps
      (run_id, case_index, status, lease_token, started_at, quota_day)
      SELECT ?, ?, 'pending', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM runs WHERE id = ? AND session_hash = ? AND expires_at > ?)
        AND (SELECT COUNT(*) FROM steps WHERE run_id = ? AND status = 'done') = ?
        AND NOT EXISTS (SELECT 1 FROM steps WHERE run_id = ? AND status = 'pending')
      RETURNING lease_token`,
    )
      .bind(
        id,
        nextIndex,
        lease,
        now,
        utcDay(now),
        id,
        owner,
        now,
        id,
        nextIndex,
        id,
      )
      .first<{ lease_token: string }>();
  } catch (error) {
    throwQuotaError(error);
    throw error;
  }
  // D1's changes metadata includes trigger writes, so ownership comes from the
  // returned lease, never an assumed affected-row count.
  if (claimed?.lease_token !== lease) return snapshot(env.DB, row);

  const testCase = CASES[nextIndex];
  // There are only two bounded calls per request. A failed output is retained
  // verbatim; there is no correction pass, hidden retry, or answer-key feedback.
  const [resultA, resultB] = await Promise.all([
    infer(env, testCase, "A", row.prompt_a),
    infer(env, testCase, "B", row.prompt_b),
  ]);
  await finishStep(
    env.DB,
    { run_id: id, case_index: nextIndex, lease_token: lease },
    resultA,
    resultB,
  );
  return snapshot(env.DB, row);
}

async function finishStep(
  db: D1Database,
  step: Pick<StepRow, "run_id" | "case_index" | "lease_token">,
  a: TrialResult,
  b: TrialResult,
): Promise<void> {
  await db
    .prepare(
      `UPDATE steps SET status = 'done', result_a = ?, result_b = ?
    WHERE run_id = ? AND case_index = ? AND lease_token = ? AND status = 'pending'`,
    )
    .bind(
      JSON.stringify(a),
      JSON.stringify(b),
      step.run_id,
      step.case_index,
      step.lease_token,
    )
    .run();
}

async function findIdempotent(
  db: D1Database,
  owner: string,
  key: string,
): Promise<RunRow | null> {
  return db
    .prepare(
      "SELECT * FROM runs WHERE session_hash = ? AND idempotency_key = ?",
    )
    .bind(owner, key)
    .first<RunRow>();
}

async function existingRun(
  db: D1Database,
  row: RunRow,
  input: CreateInput,
): Promise<ExperimentRun> {
  if (row.prompt_a !== input.promptA || row.prompt_b !== input.promptB) {
    throw new HttpError(
      409,
      "That request ID belongs to different prompts. Start a new experiment.",
    );
  }
  if (row.expires_at <= Date.now())
    throw new HttpError(410, "This experiment has expired. Start a new run.");
  if (!currentExperiment(row))
    throw new HttpError(
      409,
      "This saved experiment uses an older setup. Start a fresh run with a new request ID.",
    );
  return snapshot(db, row);
}

async function ownedRow(
  db: D1Database,
  owner: string,
  id: string,
): Promise<RunRow> {
  const row = await db
    .prepare("SELECT * FROM runs WHERE id = ? AND session_hash = ?")
    .bind(id, owner)
    .first<RunRow>();
  if (!row)
    throw new HttpError(
      404,
      "This experiment is not available in your browser session.",
    );
  if (row.expires_at <= Date.now())
    throw new HttpError(410, "This experiment has expired. Start a new run.");
  return row;
}

async function getSteps(db: D1Database, id: string): Promise<StepRow[]> {
  const result = await db
    .prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY case_index")
    .bind(id)
    .all<StepRow>();
  return result.results;
}

async function snapshot(db: D1Database, row: RunRow): Promise<ExperimentRun> {
  const steps = await getSteps(db, row.id);
  const done = steps.filter((step) => step.status === "done");
  const results = done.flatMap((step) => [
    JSON.parse(step.result_a!) as TrialResult,
    JSON.parse(step.result_b!) as TrialResult,
  ]);
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    promptA: row.prompt_a,
    promptB: row.prompt_b,
    model: row.model,
    corpusVersion: row.corpus_version,
    corpusHash: row.corpus_hash,
    experimentVersion: row.experiment_version,
    status:
      done.length === CASES.length
        ? "complete"
        : steps.length > 0
          ? "running"
          : "ready",
    completed: done.length,
    total: CASES.length,
    results,
  };
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function currentExperiment(row: RunRow): boolean {
  return (
    row.experiment_version === EXPERIMENT_FINGERPRINT &&
    row.corpus_hash === CORPUS_HASH &&
    row.model === MODEL
  );
}

function throwQuotaError(error: unknown): void {
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
      : "";
  if (message.includes("SESSION_RUN_LIMIT"))
    throw new HttpError(
      429,
      "You have used today’s four experiments. Your allowance resets at midnight UTC.",
    );
  if (
    message.includes("DAILY_RUN_LIMIT") ||
    message.includes("DAILY_ATTEMPT_LIMIT")
  ) {
    throw new HttpError(
      429,
      "The public demo has reached today’s allowance. Please try again after midnight UTC.",
    );
  }
}
