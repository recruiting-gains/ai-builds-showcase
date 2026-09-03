const CITY_CLEANUP_LIMIT = 100;
const VECTOR_CLEANUP_LIMIT = 100;
const CLEANUP_BATCH_SIZE = 5;
const VECTOR_CLEANUP_GRACE_MS = 10 * 60 * 1_000;

export const MARK_CITY_DELETING_SQL = `
  UPDATE cities
  SET state = 'deleting',
      expires_at = CASE
        WHEN expires_at IS NULL OR expires_at > ? THEN ?
        ELSE expires_at
      END,
      updated_at = ?
  WHERE id = ? AND state = 'active'
`;

export const CITY_CLEANUP_CANDIDATES_SQL = `
  SELECT id
  FROM cities
  WHERE state = 'deleting' OR expires_at <= ?
  ORDER BY CASE WHEN state = 'deleting' THEN 0 ELSE 1 END, expires_at
  LIMIT ${CITY_CLEANUP_LIMIT}
`;

interface LifecycleStatement {
  bind(...values: unknown[]): LifecycleStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface LifecycleDatabase {
  prepare(query: string): LifecycleStatement;
}

interface LifecycleVectorIndex {
  deleteByIds(ids: string[]): Promise<unknown>;
}

interface LifecycleEnv {
  DB: LifecycleDatabase;
  CONCEPT_INDEX: LifecycleVectorIndex;
}

interface CityIdRow {
  id: string;
}

interface CountRow {
  count: number;
}

interface VectorCleanupJobRow {
  id: string;
  city_id: string;
  entry_id: string;
  vector_ids: string;
  attempts: number;
}

export interface SettledItem<T, R> {
  item: T;
  outcome: PromiseSettledResult<R>;
}

export async function mapSettledInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  operation: (item: T) => Promise<R>,
): Promise<Array<SettledItem<T, R>>> {
  const settled: Array<SettledItem<T, R>> = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const outcomes = await Promise.allSettled(batch.map((item) => operation(item)));
    outcomes.forEach((outcome, outcomeIndex) => {
      const item = batch[outcomeIndex];
      if (item !== undefined) settled.push({ item, outcome });
    });
  }
  return settled;
}

function vectorIdsFrom(raw: string): string[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length === 0 || value.length > 96) return null;
    if (!value.every((item) => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item))) return null;
    return Array.from(new Set(value));
  } catch {
    return null;
  }
}

export function parseVectorCleanupIds(raw: string): string[] | null {
  return vectorIdsFrom(raw);
}

export async function enqueueVectorCleanup(
  env: LifecycleEnv,
  cityId: string,
  entryId: string,
  vectorIds: readonly string[],
  now = new Date(),
): Promise<void> {
  const createdAt = now.toISOString();
  const availableAt = new Date(now.getTime() + VECTOR_CLEANUP_GRACE_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO vector_cleanup_jobs (id, city_id, entry_id, vector_ids, created_at, available_at, attempts) VALUES (?, ?, ?, ?, ?, ?, 0)",
  ).bind(entryId, cityId, entryId, JSON.stringify(vectorIds), createdAt, availableAt).run();
}

export async function completeVectorCleanup(env: Pick<LifecycleEnv, "DB">, entryId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM vector_cleanup_jobs WHERE entry_id = ?").bind(entryId).run();
}

export async function finalizeCityDeletion(env: LifecycleEnv, cityId: string): Promise<boolean> {
  const now = new Date().toISOString();
  await env.DB.prepare(MARK_CITY_DELETING_SQL).bind(now, now, now, cityId).run();
  const rows = await env.DB.prepare("SELECT id FROM nodes WHERE city_id = ?").bind(cityId).all<CityIdRow>();
  if (rows.results.length > 0) {
    try {
      await env.CONCEPT_INDEX.deleteByIds(rows.results.map((row) => row.id));
    } catch {
      return false;
    }
  }
  await env.DB.prepare("DELETE FROM cities WHERE id = ? AND state = 'deleting'").bind(cityId).run();
  return true;
}

async function resolveVectorCleanupJob(env: LifecycleEnv, job: VectorCleanupJobRow): Promise<"removed" | "retained"> {
  const vectorIds = vectorIdsFrom(job.vector_ids);
  if (!vectorIds) throw new Error("Invalid vector cleanup job payload");

  const liveNodes = await env.DB.prepare("SELECT COUNT(*) AS count FROM nodes WHERE entry_id = ?")
    .bind(job.entry_id).first<CountRow>();
  if ((liveNodes?.count ?? 0) > 0) {
    await env.DB.prepare("DELETE FROM vector_cleanup_jobs WHERE id = ?").bind(job.id).run();
    return "retained";
  }

  await env.CONCEPT_INDEX.deleteByIds(vectorIds);
  await env.DB.prepare("DELETE FROM vector_cleanup_jobs WHERE id = ?").bind(job.id).run();
  return "removed";
}

async function cleanupVectorJobs(env: LifecycleEnv): Promise<void> {
  const now = new Date().toISOString();
  const jobs = await env.DB.prepare(
    `SELECT id, city_id, entry_id, vector_ids, attempts
     FROM vector_cleanup_jobs
     WHERE available_at <= ?
     ORDER BY available_at
     LIMIT ${VECTOR_CLEANUP_LIMIT}`,
  ).bind(now).all<VectorCleanupJobRow>();

  const outcomes = await mapSettledInBatches(jobs.results, CLEANUP_BATCH_SIZE, (job) => resolveVectorCleanupJob(env, job));
  let removed = 0;
  let retained = 0;
  let failed = 0;
  for (const { item: job, outcome } of outcomes) {
    if (outcome.status === "fulfilled") {
      if (outcome.value === "removed") removed += 1;
      else retained += 1;
      continue;
    }
    failed += 1;
    try {
      await env.DB.prepare("UPDATE vector_cleanup_jobs SET attempts = attempts + 1 WHERE id = ?")
        .bind(job.id).run();
    } catch (error) {
      console.error(JSON.stringify({ event: "vector_cleanup_attempt_update_failed", jobId: job.id, errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
    console.error(JSON.stringify({ event: "vector_cleanup_failed", jobId: job.id, cityId: job.city_id, attempt: job.attempts + 1, errorClass: outcome.reason instanceof Error ? outcome.reason.name : "UnknownError" }));
  }

  const backlog = await env.DB.prepare("SELECT COUNT(*) AS count FROM vector_cleanup_jobs WHERE available_at <= ?")
    .bind(now).first<CountRow>();
  console.log(JSON.stringify({ event: "vector_cleanup", examined: jobs.results.length, removed, retained, failed, remaining: backlog?.count ?? 0 }));
}

async function cleanupCities(env: LifecycleEnv): Promise<void> {
  const now = new Date().toISOString();
  const candidates = await env.DB.prepare(CITY_CLEANUP_CANDIDATES_SQL).bind(now).all<CityIdRow>();
  const outcomes = await mapSettledInBatches(candidates.results, CLEANUP_BATCH_SIZE, (city) => finalizeCityDeletion(env, city.id));
  let deleted = 0;
  let pending = 0;
  let failed = 0;
  for (const { item: city, outcome } of outcomes) {
    if (outcome.status === "fulfilled") {
      if (outcome.value) deleted += 1;
      else pending += 1;
      continue;
    }
    failed += 1;
    console.error(JSON.stringify({ event: "expired_city_cleanup_failed", cityId: city.id, errorClass: outcome.reason instanceof Error ? outcome.reason.name : "UnknownError" }));
  }

  const backlog = await env.DB.prepare("SELECT COUNT(*) AS count FROM cities WHERE state = 'deleting' OR expires_at <= ?")
    .bind(now).first<CountRow>();
  console.log(JSON.stringify({ event: "expired_city_cleanup", examined: candidates.results.length, deleted, pending, failed, remaining: backlog?.count ?? 0 }));
}

export async function runScheduledCleanup(env: LifecycleEnv): Promise<void> {
  const outcomes = await Promise.allSettled([
    cleanupVectorJobs(env),
    cleanupCities(env),
  ]);
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      console.error(JSON.stringify({ event: index === 0 ? "vector_cleanup_job_failed" : "city_cleanup_job_failed", errorClass: outcome.reason instanceof Error ? outcome.reason.name : "UnknownError" }));
    }
  });
}
