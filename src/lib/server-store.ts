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
  readSupabaseRestSnapshot,
  writeToSupabaseRest,
  StoreConflictError,
} from "./supabase-rest-store";
import { mergeStore } from "./store-merge";

export { mergeStore } from "./store-merge";
export { StoreConflictError } from "./supabase-rest-store";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_PATH = "fin-dashboard/store.json";

/** Blob suspended / broken — აღარ ვცდილობთ */
let blobDisabled = process.env.DISABLE_VERCEL_BLOB === "1" || process.env.DISABLE_VERCEL_BLOB === "true";

/** ბოლო წაკითხული Supabase updated_at — conflict-safe ჩაწერისთვის */
let lastKnownUpdatedAt: string | null = null;

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
      const snap = await readSupabaseRestSnapshot();
      if (snap) {
        lastKnownUpdatedAt = snap.updatedAt;
        return snap.store;
      }
      lastKnownUpdatedAt = null;
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

async function backupAfterWrite(store: Store, source: string) {
  try {
    const { backupStoreNow } = await import("./store-backup");
    await backupStoreNow(store, source);
  } catch (err) {
    console.error("backup after write failed", err);
  }
}

export type PersistOptions = {
  /** მხოლოდ ადმინის ბექაპიდან აღდგენისთვის — უსაფრთხოების გარდების გვერდის ავლით */
  allowDestructive?: boolean;
  /** ბექაპის source ტეგი */
  backupSource?: string;
};

function storeCounts(store: Store) {
  return {
    txs: store.transactions?.length ?? 0,
    reports: store.branchReports?.length ?? 0,
    employees: store.employees?.length ?? 0,
  };
}

/**
 * იცავს ბაზას შემთხვევითი გაწმენდისგან:
 * 1) ცარიელი store არ გადაწერს სავსე ბაზას
 * 2) მკვეთრი შემცირება (ტრანზაქციები/რეპორტები/თანამშრომლები) უარყოფილია
 */
async function assertSafePersist(incoming: Store, allowDestructive?: boolean) {
  if (allowDestructive) return;
  if (!hasSupabaseRestStore()) return;

  let existing: Store | null = null;
  try {
    const snap = await readSupabaseRestSnapshot();
    existing = snap?.store ?? null;
  } catch {
    const empty =
      (incoming.transactions?.length ?? 0) === 0 &&
      (incoming.branchReports?.length ?? 0) === 0;
    if (empty) {
      throw new Error("ცარიელი მონაცემების შენახვა ვერ მოხერხდა — ბაზის შემოწმება ვერ გაკეთდა");
    }
    // სავსე ჩაწერა — თუ წაკითხვა ვერ მოხერხდა, მაინც ვუშვებთ (ფილიალის გაგზავნა არ უნდა ჩაჭრას)
    return;
  }

  if (!existing) return;

  const cur = storeCounts(existing);
  const next = storeCounts(incoming);

  if (cur.txs > 0 || cur.reports > 0) {
    if (next.txs === 0 && next.reports === 0) {
      throw new Error(
        "ცარიელი მონაცემებით შენახვა უარყოფილია — ბაზაში უკვე არის ტრანზაქციები/რეპორტები"
      );
    }
  }

  // მკვეთრი შემცირება: >50% და მინ. 30 ჩანაწერის დაკარგვა
  if (cur.txs >= 30 && next.txs < cur.txs * 0.5 && cur.txs - next.txs >= 30) {
    throw new Error(
      `შენახვა უარყოფილია — ტრანზაქციები არ შეიძლება შემცირდეს ${cur.txs}-დან ${next.txs}-მდე`
    );
  }
  if (cur.reports >= 5 && next.reports < cur.reports * 0.5 && cur.reports - next.reports >= 3) {
    throw new Error(
      `შენახვა უარყოფილია — რეპორტები არ შეიძლება შემცირდეს ${cur.reports}-დან ${next.reports}-მდე`
    );
  }
  // თანამშრომლების მასობრივი წაშლა (ფილიალის გაგზავნა ამას ვერ გააკეთებს)
  if (cur.employees >= 5 && next.employees < 3 && next.employees < cur.employees * 0.4) {
    throw new Error(
      `შენახვა უარყოფილია — თანამშრომლები არ შეიძლება შემცირდეს ${cur.employees}-დან ${next.employees}-მდე`
    );
  }
}

async function persistStore(
  store: Store,
  expectedUpdatedAt?: string | null,
  options?: PersistOptions
) {
  const errors: string[] = [];
  await assertSafePersist(store, options?.allowDestructive);

  const backupSource = options?.backupSource ?? "write";

  if (hasPostgres()) {
    try {
      await writeToPostgres(store);
      await backupAfterWrite(store, `postgres:${backupSource}`);
      return;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasSupabaseRestStore()) {
    try {
      const nextAt = await writeToSupabaseRest(store, expectedUpdatedAt);
      lastKnownUpdatedAt = nextAt;
      await backupAfterWrite(store, `supabase-rest:${backupSource}`);
      return;
    } catch (err) {
      if (err instanceof StoreConflictError) throw err;
      // უსაფრთხოების გარდა — არ ვცდილობთ სხვა backend-ზე ცარიელ/საშიშ ჩაწერას
      if (err instanceof Error && /უარყოფილია|ვერ მოხერხდა — ბაზის/.test(err.message)) throw err;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasSupabaseStorage()) {
    try {
      await writeToSupabaseStorage(store);
      await backupAfterWrite(store, `supabase-storage:${backupSource}`);
      return;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (hasBlobStorage()) {
    try {
      await writeToBlob(store);
      await backupAfterWrite(store, `vercel-blob:${backupSource}`);
      return;
    } catch (err) {
      if (isBlobSuspendedError(err)) blobDisabled = true;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  try {
    await writeToFile(store);
    await backupAfterWrite(store, `local-file:${backupSource}`);
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
      const existing = await readSupabaseRestSnapshot().catch(() => null);
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

  // ცარიელ default-ს ბაზაში აღარ ვწერთ — წაკითხვის შეცდომისას ძველი მონაცემები არ უნდა წაიშალოს
  if (!loaded) {
    return store;
  }

  const missingIds = (loaded.transactions ?? []).some((t) => !t.id);
  if (changed || missingIds) {
    try {
      await persistStore(store, hasSupabaseRestStore() ? lastKnownUpdatedAt : undefined);
    } catch {
      // Obligation sync failed to persist — return in-memory store anyway
    }
  }
  return store;
}

export async function writeStore(store: Store, options?: PersistOptions) {
  await persistStore(
    store,
    hasSupabaseRestStore() ? lastKnownUpdatedAt : undefined,
    options
  );
}

export async function updateStore(
  mutator: (store: Store) => void,
  retriesOrOptions: number | (PersistOptions & { retries?: number }) = 6
): Promise<Store> {
  const options: PersistOptions & { retries?: number } =
    typeof retriesOrOptions === "number" ? { retries: retriesOrOptions } : retriesOrOptions;
  const retries = options.retries ?? 6;
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const store = await readStore();
      // თუ ბაზა ვერ ჩაიტვირთა — ცარიელ default-ზე მუტაცია/ჩაწერა აკრძალულია
      if (
        !options.allowDestructive &&
        hasSupabaseRestStore() &&
        (store.transactions?.length ?? 0) === 0 &&
        (store.branchReports?.length ?? 0) === 0
      ) {
        const snap = await readSupabaseRestSnapshot().catch(() => null);
        const existingTxs = snap?.store.transactions?.length ?? 0;
        const existingReports = snap?.store.branchReports?.length ?? 0;
        if (existingTxs > 0 || existingReports > 0) {
          throw new Error("ბაზის ჩატვირთვა ვერ მოხერხდა — შენახვა გადაიდო რომ მონაცემები არ დაიკარგოს");
        }
        // ბაზა მართლა ცარიელია ან წაკითხვა ჩაიშალა — ხელახლა ვცდილობთ
        if (!snap && i < retries - 1) {
          await new Promise((r) => setTimeout(r, 150 * (i + 1)));
          continue;
        }
      }
      const expectedAt = hasSupabaseRestStore() ? lastKnownUpdatedAt : undefined;
      mutator(store);
      await persistStore(store, expectedAt, options);
      return store;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const conflict =
        err instanceof StoreConflictError || /StoreConflict|განაახლა/i.test(lastError.message);
      const refused = /უარყოფილია|გადაიდო|ვერ მოხერხდა — ბაზის/.test(lastError.message);
      if (refused && !conflict) throw lastError;
      await new Promise((r) => setTimeout(r, conflict ? 80 * (i + 1) : 120 * (i + 1)));
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
