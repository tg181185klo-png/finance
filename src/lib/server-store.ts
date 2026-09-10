import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { head, put } from "@vercel/blob";
import type { PutCommandOptions } from "@vercel/blob";
import type { Branch, Store } from "./types";
import { BRANCHES } from "./constants";
import { syncMonthObligationCycles, currentMonth } from "./utils";
import { env } from "./env";
import { hasPostgres, readFromPostgres, writeToPostgres } from "./db";
import {
  hasSupabaseStorage,
  readFromSupabaseStorage,
  writeToSupabaseStorage,
} from "./supabase-store";
import {
  hasSupabaseRestStore,
  readFromSupabaseRest,
  writeToSupabaseRest,
} from "./supabase-rest-store";
import { mergeStore } from "./store-merge";

export { mergeStore } from "./store-merge";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_PATH = "fin-dashboard/store.json";

/** Blob suspended / broken — აღარ ვცდილობთ */
let blobDisabled = process.env.DISABLE_VERCEL_BLOB === "1" || process.env.DISABLE_VERCEL_BLOB === "true";

function isBlobSuspendedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /suspended|blob.*unavailable|store has been suspended/i.test(msg);
}

function hasBlobStorage() {
  if (blobDisabled) return false;
  return Boolean(env.blobToken || process.env.VERCEL_OIDC_TOKEN || process.env.BLOB_STORE_ID);
}

export const DEFAULT_STORE: Store = mergeStore({});

async function loadStoreRaw(): Promise<Store | null> {
  if (hasPostgres()) {
    try {
      const pg = await readFromPostgres();
      if (pg) return mergeStore(pg);
    } catch {
      // fall through
    }
  }
  if (hasSupabaseRestStore()) {
    try {
      const rest = await readFromSupabaseRest();
      if (rest) return rest;
    } catch {
      // fall through
    }
  }
  if (hasSupabaseStorage()) {
    try {
      const sb = await readFromSupabaseStorage();
      if (sb) return sb;
    } catch {
      // fall through
    }
  }
  if (hasBlobStorage()) {
    try {
      const blob = await readFromBlob();
      if (blob) return blob;
    } catch (err) {
      if (isBlobSuspendedError(err)) blobDisabled = true;
    }
  }
  try {
    return await readFromFile();
  } catch {
    return null;
  }
}

async function persistStore(store: Store) {
  const errors: string[] = [];

  if (hasPostgres()) {
    try {
      await writeToPostgres(store);
      return;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasSupabaseRestStore()) {
    try {
      await writeToSupabaseRest(store);
      return;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasSupabaseStorage()) {
    try {
      await writeToSupabaseStorage(store);
      return;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasBlobStorage()) {
    try {
      await writeToBlob(store);
      return;
    } catch (err) {
      if (isBlobSuspendedError(err)) blobDisabled = true;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  try {
    await writeToFile(store);
    return;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  throw new Error(
    errors.find((e) => /suspended/i.test(e))
      ? "Vercel Blob შეჩერებულია — მონაცემები Supabase-ზე ინახება. განაახლეთ გვერდი და კიდევ სცადეთ."
      : errors[0] ?? "მონაცემების შენახვა ვერ მოხერხდა"
  );
}

async function migrateToPostgresIfNeeded() {
  if (!hasPostgres() && !hasSupabaseRestStore()) return;
  try {
    if (hasPostgres()) {
      const existing = await readFromPostgres();
      if (existing) return;
    }
    if (hasSupabaseRestStore()) {
      const existing = await readFromSupabaseRest().catch(() => null);
      if (existing) return;
    }

    let seed: Store | null = null;
    if (hasSupabaseStorage()) {
      seed = await readFromSupabaseStorage().catch(() => null);
    }
    if (!seed && hasBlobStorage()) {
      try {
        seed = await readFromBlob();
      } catch (err) {
        if (isBlobSuspendedError(err)) blobDisabled = true;
      }
    }
    if (!seed) {
      seed = await readFromFile().catch(() => null);
    }
    if (!seed) return;

    const merged = mergeStore(seed);
    if (hasPostgres()) await writeToPostgres(merged);
    else if (hasSupabaseRestStore()) await writeToSupabaseRest(merged);
  } catch {
    // Migration is best-effort
  }
}

async function readFromFile(): Promise<Store> {
  const raw = await readFile(STORE_PATH, "utf-8");
  return mergeStore(JSON.parse(raw) as Partial<Store>);
}

async function writeToFile(store: Store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

async function readFromBlob(): Promise<Store | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const meta = await head(BLOB_PATH, env.blobToken ? { token: env.blobToken } : {});
      const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      return mergeStore((await res.json()) as Partial<Store>);
    } catch (err) {
      if (isBlobSuspendedError(err)) {
        blobDisabled = true;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  return null;
}

async function writeToBlob(store: Store) {
  const options: PutCommandOptions = {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
  };

  if (env.blobToken) {
    options.token = env.blobToken;
  }

  try {
    await put(BLOB_PATH, JSON.stringify(store, null, 2), options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "blob write failed";
    throw new Error(`მონაცემების შენახვა ვერ მოხერხდა: ${msg}`);
  }
}

export async function readStore(): Promise<Store> {
  await migrateToPostgresIfNeeded();
  const loaded = await loadStoreRaw();
  const store = loaded ?? { ...DEFAULT_STORE };

  const months = new Set([currentMonth()]);
  for (const m of Object.keys(store.obligations)) months.add(m);

  let changed = false;
  for (const m of months) {
    if (syncMonthObligationCycles(store, m)) changed = true;
  }

  if (syncMonthObligationCycles(store, currentMonth())) changed = true;

  if (!loaded) {
    try {
      await persistStore(store);
    } catch {
      // Storage may be read-only or misconfigured — still return defaults for UI
    }
    return store;
  }

  const missingIds = (loaded.transactions ?? []).some((t) => !t.id);
  if (changed || missingIds) {
    try {
      await persistStore(store);
    } catch {
      // Obligation sync failed to persist — return in-memory store anyway
    }
  }
  return store;
}

export async function writeStore(store: Store) {
  await persistStore(store);
}

export async function updateStore(
  mutator: (store: Store) => void,
  retries = 4
): Promise<Store> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const store = await readStore();
      mutator(store);
      await writeStore(store);
      return store;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
  }

  throw lastError ?? new Error("მონაცემების შენახვა ვერ მოხერხდა");
}

export function branchByToken(store: Store, token: string): Branch | null {
  for (const b of BRANCHES) {
    if (store.branchTokens[b] === token) return b;
  }
  return null;
}

export function overviewByToken(store: Store, token: string): boolean {
  return store.overviewReportToken === token;
}

export function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

export function storageMode() {
  if (hasPostgres()) return "supabase-postgres";
  if (hasSupabaseRestStore()) return "supabase-rest";
  if (hasSupabaseStorage()) return "supabase-storage";
  if (hasBlobStorage()) return "vercel-blob";
  return "local-file";
}

export async function diagnoseStorage() {
  const postgres = await import("./db").then((m) => m.testPostgres());
  const supabase = await import("./supabase-store").then((m) => m.testSupabaseStorage());
  const supabaseRest = await import("./supabase-rest-store").then((m) => m.testSupabaseRest());
  const backups = await import("./store-backup").then((m) => m.testStoreBackups());
  return {
    mode: storageMode(),
    postgres,
    supabase,
    supabaseRest,
    backups,
    blob: hasBlobStorage(),
    blobDisabled,
  };
}
