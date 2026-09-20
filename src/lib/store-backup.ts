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

/** სწრაფი ზედიზედ ჩაწერებისას (მაგ. მარაგის autosave) — მინ. ინტერვალი */
const WRITE_BACKUP_MIN_MS = 3_000;
const KEEP_RECENT_DAYS = 7;
const KEEP_DAILY_DAYS = 90;
const MAX_BACKUPS = 300;

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

function isSuspiciouslyEmpty(store: Store) {
  const txs = store.transactions?.length ?? 0;
  const reports = store.branchReports?.length ?? 0;
  return txs === 0 && reports === 0;
}

/**
 * ყოველი წარმატებული შენახვის შემდეგ — მაშინვე ბექაპი.
 * მხოლოდ 3 წამიანი coalesce სწრაფი ზედიზედ ჩაწერებისთვის.
 * ცარიელ store-ს არ ვბექაპებთ — რომ ცარიელი ასლები არ გადაფაროს ისტორიას.
 */
export async function maybeCreateAutoBackup(store: Store, source = "write") {
  if (!canBackupStore()) return null;
  if (isSuspiciouslyEmpty(store)) return null;
  if (Date.now() - lastWriteBackupAt < WRITE_BACKUP_MIN_MS) return null;
  try {
    return await createStoreBackup(store, "auto", source);
  } catch (err) {
    console.error("auto backup failed", err);
    return null;
  }
}

/** იძულებითი ბექაპი (ფილიალის გაგზავნა / მნიშვნელოვანი ჩაწერა) — throttle-ის გარეშე */
export async function backupStoreNow(store: Store, source = "write") {
  if (!canBackupStore()) return null;
  if (isSuspiciouslyEmpty(store) && source !== "admin-manual") return null;
  try {
    lastWriteBackupAt = 0;
    return await createStoreBackup(store, "auto", source);
  } catch (err) {
    console.error("backupStoreNow failed", err);
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
    .select("id, created_at, reason, meta")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data?.length) return;

  const now = Date.now();
  const keep = new Set<string>();
  const bestByDay = new Map<string, { id: string; txs: number }>();

  type Row = { id: string; created_at: string; reason: string; meta?: Record<string, unknown> | null };
  const rows = data as Row[];

  const txCount = (row: Row) => Number(row.meta?.transactions ?? 0);

  // ბოლო 7 დღე: ვინახავთ ყველა არა-ცარიელს + მაქს. რამდენიმე ცარიელს
  let emptyRecentKept = 0;
  for (const row of rows) {
    const t = new Date(row.created_at).getTime();
    const ageDays = (now - t) / (24 * 60 * 60 * 1000);
    if (ageDays > KEEP_RECENT_DAYS) continue;
    const txs = txCount(row);
    if (txs > 0) {
      keep.add(row.id);
    } else if (emptyRecentKept < 3) {
      keep.add(row.id);
      emptyRecentKept += 1;
    }
  }

  // 7–90 დღე: დღეში ერთი — ყველაზე მდიდარი (ტრანზაქციებით)
  for (const row of rows) {
    const t = new Date(row.created_at).getTime();
    const ageDays = (now - t) / (24 * 60 * 60 * 1000);
    if (ageDays <= KEEP_RECENT_DAYS || ageDays > KEEP_DAILY_DAYS) continue;
    const day = row.created_at.slice(0, 10);
    const txs = txCount(row);
    const prev = bestByDay.get(day);
    if (!prev || txs > prev.txs) bestByDay.set(day, { id: row.id, txs });
    if (row.reason === "manual" || row.reason === "pre-restore") keep.add(row.id);
  }
  for (const v of bestByDay.values()) keep.add(v.id);

  // ყოველთვის შევინახოთ ისტორიაში ყველაზე დიდი ბექაპები
  const richest = [...rows].sort((a, b) => txCount(b) - txCount(a)).slice(0, 20);
  for (const row of richest) {
    if (txCount(row) > 0) keep.add(row.id);
  }

  // შეავსე MAX_BACKUPS-მდე ახლიდან (არა-ცარიელი უპირატესი)
  for (const row of rows) {
    if (keep.size >= MAX_BACKUPS) break;
    if (txCount(row) > 0) keep.add(row.id);
  }
  for (const row of rows) {
    if (keep.size >= MAX_BACKUPS) break;
    keep.add(row.id);
  }

  const toDelete = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
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
