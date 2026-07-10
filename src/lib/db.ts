import { sql } from "@vercel/postgres";
import type { Store } from "./types";

export function hasPostgres() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

let dbReady = false;

async function ensureTable() {
  if (dbReady) return;
  await sql`
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
  const { rows } = await sql`SELECT payload FROM finance_store WHERE id = 'main'`;
  if (!rows.length) return null;
  return rows[0].payload as Store;
}

export async function writeToPostgres(store: Store) {
  if (!hasPostgres()) throw new Error("Postgres not configured");
  await ensureTable();
  const json = JSON.stringify(store);
  await sql`
    INSERT INTO finance_store (id, payload, updated_at)
    VALUES ('main', ${json}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `;
}
