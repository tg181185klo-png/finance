import postgres from "postgres";
import type { Store } from "./types";

export function postgresUrl() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ""
  );
}

export function hasPostgres() {
  return Boolean(postgresUrl());
}

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sql) {
    const url = postgresUrl();
    if (!url) throw new Error("Postgres URL not configured");
    sql = postgres(url, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

let dbReady = false;

async function ensureTable() {
  if (dbReady) return;
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS finance_store (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  dbReady = true;
}

export async function readFromPostgres(): Promise<Store | null> {
  if (!hasPostgres()) return null;
  await ensureTable();
  const db = getSql();
  const rows = await db`SELECT payload FROM finance_store WHERE id = 'main'`;
  if (!rows.length) return null;
  return rows[0].payload as Store;
}

export async function writeToPostgres(store: Store) {
  if (!hasPostgres()) throw new Error("Postgres not configured");
  await ensureTable();
  const db = getSql();
  const payload = JSON.parse(JSON.stringify(store)) as postgres.JSONValue;
  await db`
    INSERT INTO finance_store (id, payload, updated_at)
    VALUES ('main', ${db.json(payload)}, NOW())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `;
}

export async function testPostgres(): Promise<{ ok: boolean; error?: string }> {
  if (!hasPostgres()) return { ok: false, error: "POSTGRES_URL not set" };
  try {
    await ensureTable();
    const db = getSql();
    await db`SELECT 1 AS ok`;
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
