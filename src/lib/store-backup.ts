import type { Store } from "./types";
import { mergeStore } from "./store-merge";
import { getSupabaseRestClient, hasSupabaseRestStore } from "./supabase-rest-store";

export type BackupReason = "manual" | "auto" | "daily" | "pre-restore";

export type StoreBackupMeta = {
  id: string;
  createdAt: string;
  reason: BackupReason;
  source: string;
  transactions: number;
  employees: number;
  branchReports: number;
  bytes: number;
};

export type StoreBackup = StoreBackupMeta & {
  payload: Store;
};

const WRITE_BACKUP_MIN_MS = 30 * 60 * 1000;
const KEEP_RECENT_DAYS = 7;
const KEEP_DAILY_DAYS = 90;
const MAX_BACKUPS = 200;

let lastWriteBackupAt = 0;

function storeStats(store: Store) {
  const json = JSON.stringify(store);
  return {
    transactions: store.transactions?.length ?? 0,
    employees: store.employees?.length ?? 0,
    branchReports: store.branchReports?.length ?? 0,
    bytes: Buffer.byteLength(json, "utf8"),
    payload: JSON.parse(json) as Store,
  };
}

function rowToMeta(row: {
  id: string;
  created_at: string;
  reason: string;
  source: string;
  meta?: Record<string, unknown> | null;
}): StoreBackupMeta {
  const meta = row.meta ?? {};
  return {
    id: row.id,
    createdAt: row.created_at,
    reason: (row.reason as BackupReason) || "manual",
    source: row.source || "app",
    transactions: Number(meta.transactions ?? 0),
    employees: Number(meta.employees ?? 0),
    branchReports: Number(meta.branchReports ?? 0),
    bytes: Number(meta.bytes ?? 0),
  };
}

export function canBackupStore() {
  return hasSupabaseRestStore();
}

export async function createStoreBackup(
  store: Store,
  reason: BackupReason = "manual",
  source = "app"
): Promise<StoreBackupMeta> {
  if (!canBackupStore()) throw new Error("ბექაპი მიუწვდომელია — Supabase არ არის კონფიგურირებული");
  const sb = getSupabaseRestClient();
  const stats = storeStats(store);
  const id = `bak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const { error } = await sb.from("finance_store_backups").insert({
    id,
    created_at: createdAt,
    reason,
    source,
    payload: stats.payload,
    meta: {
      transactions: stats.transactions,
      employees: stats.employees,
      branchReports: stats.branchReports,
      bytes: stats.bytes,
    },
  });
  if (error) throw new Error(`ბექაპის შექმნა ვერ მოხერხდა: ${error.message}`);

  if (reason === "auto" || reason === "daily") lastWriteBackupAt = Date.now();
  pruneStoreBackups().catch(() => {});

  return {
    id,
    createdAt,
    reason,
    source,
    transactions: stats.transactions,
    employees: stats.employees,
    branchReports: stats.branchReports,
    bytes: stats.bytes,
  };
}

/** შენახვისას — მაქს. ერთხელ 30 წუთში (დღიური cron ცალკეა) */
export async function maybeCreateAutoBackup(store: Store, source = "write") {
  if (!canBackupStore()) return null;
  if (Date.now() - lastWriteBackupAt < WRITE_BACKUP_MIN_MS) return null;
  try {
    return await createStoreBackup(store, "auto", source);
  } catch {
    return null;
  }
}

export async function listStoreBackups(limit = 50): Promise<StoreBackupMeta[]> {
  if (!canBackupStore()) return [];
  const sb = getSupabaseRestClient();
  const { data, error } = await sb
    .from("finance_store_backups")
    .select("id, created_at, reason, source, meta")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ბექაპების სია: ${error.message}`);
  return (data ?? []).map(rowToMeta);
}

export async function getStoreBackup(id: string): Promise<StoreBackup | null> {
  if (!canBackupStore()) return null;
  const sb = getSupabaseRestClient();
  const { data, error } = await sb
    .from("finance_store_backups")
    .select("id, created_at, reason, source, meta, payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`ბექაპის წაკითხვა: ${error.message}`);
  if (!data?.payload) return null;
  return {
    ...rowToMeta(data),
    payload: mergeStore(data.payload as Partial<Store>),
  };
}

export async function pruneStoreBackups() {
  if (!canBackupStore()) return;
  const sb = getSupabaseRestClient();
  const { data, error } = await sb
    .from("finance_store_backups")
    .select("id, created_at, reason")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data?.length) return;

  const now = Date.now();
  const keep = new Set<string>();
  const seenDay = new Set<string>();

  for (const row of data) {
    const t = new Date(row.created_at).getTime();
    const ageDays = (now - t) / (24 * 60 * 60 * 1000);
    const day = row.created_at.slice(0, 10);

    if (ageDays <= KEEP_RECENT_DAYS) {
      keep.add(row.id);
      continue;
    }
    if (ageDays <= KEEP_DAILY_DAYS && !seenDay.has(day)) {
      seenDay.add(day);
      keep.add(row.id);
      continue;
    }
    if (row.reason === "manual" && ageDays <= KEEP_DAILY_DAYS) {
      keep.add(row.id);
    }
  }

  // Always keep newest MAX_BACKUPS among selected + fill from newest
  const ordered = data.map((r) => r.id);
  for (const id of ordered) {
    if (keep.size >= MAX_BACKUPS) break;
    keep.add(id);
  }

  const toDelete = data.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (!toDelete.length) return;
  for (let i = 0; i < toDelete.length; i += 50) {
    const chunk = toDelete.slice(i, i + 50);
    await sb.from("finance_store_backups").delete().in("id", chunk);
  }
}

export async function testStoreBackups(): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!canBackupStore()) return { ok: false, error: "Supabase not configured" };
  try {
    const sb = getSupabaseRestClient();
    const { count, error } = await sb
      .from("finance_store_backups")
      .select("id", { count: "exact", head: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: count ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
