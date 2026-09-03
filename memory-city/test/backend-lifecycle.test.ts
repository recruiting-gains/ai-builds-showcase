import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  CITY_CLEANUP_CANDIDATES_SQL,
  MARK_CITY_DELETING_SQL,
  mapSettledInBatches,
  parseVectorCleanupIds,
} from "../src/worker/lifecycle";

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  for (const migration of [
    "0001_initial.sql",
    "0002_lifecycle_and_idempotency.sql",
    "0003_backend_hardening.sql",
  ]) {
    database.exec(readFileSync(join(process.cwd(), "migrations", migration), "utf8"));
  }
  return database;
}

function insertCity(
  database: DatabaseSync,
  id: string,
  state: "active" | "deleting",
  expiresAt: string,
): void {
  database.prepare(
    "INSERT INTO cities (id, edit_token_hash, name, created_at, updated_at, state, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, "hash", id, "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", state, expiresAt);
}

describe("backend lifecycle migrations", () => {
  it("prioritizes every deleting city even when its original expiry is in the future", () => {
    const database = migratedDatabase();
    const now = "2026-09-03T05:00:00.000Z";
    insertCity(database, "active-future", "active", "2027-03-02T00:00:00.000Z");
    insertCity(database, "expired-active", "active", "2026-09-02T00:00:00.000Z");
    insertCity(database, "deleting-future", "deleting", "2027-03-02T00:00:00.000Z");

    const rows = database.prepare(CITY_CLEANUP_CANDIDATES_SQL).all(now) as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toEqual(["deleting-future", "expired-active"]);
    database.close();
  });

  it("moves a manual deletion into the immediately retryable window", () => {
    const database = migratedDatabase();
    const now = "2026-09-03T05:00:00.000Z";
    insertCity(database, "manual-delete", "active", "2027-03-02T00:00:00.000Z");

    database.prepare(MARK_CITY_DELETING_SQL).run(now, now, now, "manual-delete");
    const row = database.prepare(
      "SELECT state, expires_at, updated_at FROM cities WHERE id = ?",
    ).get("manual-delete") as { state: string; expires_at: string; updated_at: string };
    expect(row).toEqual({ state: "deleting", expires_at: now, updated_at: now });
    database.close();
  });

  it("installs a durable vector cleanup ledger", () => {
    const database = migratedDatabase();
    const vectorId = "2cd544a9-e2a0-4c75-b4df-004087ed992c";
    database.prepare(
      "INSERT INTO vector_cleanup_jobs (id, city_id, entry_id, vector_ids, created_at, available_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("job", "city", "entry", JSON.stringify([vectorId]), "2026-09-03T05:00:00.000Z", "2026-09-03T05:10:00.000Z");
    const row = database.prepare("SELECT vector_ids, attempts FROM vector_cleanup_jobs WHERE id = ?").get("job") as {
      vector_ids: string;
      attempts: number;
    };
    expect(parseVectorCleanupIds(row.vector_ids)).toEqual([vectorId]);
    expect(row.attempts).toBe(0);
    database.close();
  });
});

describe("resilient cleanup batching", () => {
  it("continues after one item fails", async () => {
    const visited: number[] = [];
    const outcomes = await mapSettledInBatches([1, 2, 3], 2, async (item) => {
      visited.push(item);
      if (item === 2) throw new Error("temporary failure");
      return item * 10;
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(outcomes.map(({ outcome }) => outcome.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("rejects malformed vector cleanup payloads", () => {
    expect(parseVectorCleanupIds('{"id":"not-an-array"}')).toBeNull();
    expect(parseVectorCleanupIds('["not-a-vector-id"]')).toBeNull();
  });
});
