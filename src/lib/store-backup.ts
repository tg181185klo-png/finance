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

/** დღეში ერთი ასლი, 30 დღე. ხელით და აღდგენამდე ასლები ცალკე რჩება. */
const KEEP_DAILY_DAYS = 30;
const KEEP_EXTRA = 8;

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

function tbilisiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function tbilisiDayStartIso(now = new Date()) {
  return new Date(`${tbilisiDateKey(now)}T00:00:00+04:00`).toISOString();
}

let ensuredDay = "";
let ensureFlight: Promise<void> | null = null;

/** დღეში ერთი ავტომატური ასლი. თუ იმ დღეს უკვე არის ხელით ან ყოველდღიური, აღარ იმეორებს. */
export async function ensureDailyStoreBackup(store: Store) {
  if (!canBackupStore()) return;
  if ((store.transactions?.length ?? 0) === 0) return;
  const day = tbilisiDateKey();
  if (ensuredDay === day || ensureFlight) return;
  ensureFlight = (async () => {
    try {
      const sb = getSupabaseRestClient();
      const since = tbilisiDayStartIso();
      const { data, error } = await sb
        .from("finance_store_backups")
        .select("id")
        .gte("created_at", since)
        .limit(1);
      if (error) return;
      if ((data?.length ?? 0) > 0) {
        ensuredDay = day;
        return;
      }
      await createStoreBackup(store, "daily", "auto");
      ensuredDay = day;
    } catch {
      // ბექაპმა წაკითხვა არ უნდა გააჩეროს
    } finally {
      ensureFlight = null;
    }
  })();
  await ensureFlight;
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

  pruneStoreBackups(2).catch(() => {});

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

export async function listStoreBackups(limit = 40): Promise<StoreBackupMeta[]> {
  if (!canBackupStore()) return [];
  const sb = getSupabaseRestClient();
  const { data, error } = await sb
    .from("finance_store_backups")
    .select("id, created_at, reason, source, meta")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw new Error(`ბექაპების სია: ${error.message}`);
  const seenDay = new Set<string>();
  const picked: StoreBackupMeta[] = [];
  for (const row of (data ?? []).map(rowToMeta)) {
    const extra = row.reason === "manual" || row.reason === "pre-restore";
    const day = row.createdAt.slice(0, 10);
    if (!extra && seenDay.has(day)) continue;
    if (!extra) seenDay.add(day);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
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

/**
 * ზედმეტ ასლებს შლის რამდენიმე პარტიად.
 * რჩება: ბოლო 30 დღის განმავლობაში დღეში ერთი (უახლესი) და რამდენიმე ხელით/აღდგენამდე ასლი.
 */
export async function pruneStoreBackups(maxPasses = 8) {
  if (!canBackupStore()) return;
  const sb = getSupabaseRestClient();
  type Row = { id: string; created_at: string; reason: string };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const { data, error } = await sb
      .from("finance_store_backups")
      .select("id, created_at, reason")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data?.length) return;

    const now = Date.now();
    const keep = new Set<string>();
    const seenDay = new Set<string>();
    let extras = 0;
    const rows = data as Row[];

    for (const row of rows) {
      const ageDays = (now - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000);
      if (row.reason === "manual" || row.reason === "pre-restore") {
        if (extras < KEEP_EXTRA) {
          keep.add(row.id);
          extras += 1;
        }
      }
      if (ageDays <= KEEP_DAILY_DAYS) {
        const day = row.created_at.slice(0, 10);
        if (!seenDay.has(day)) {
          seenDay.add(day);
          keep.add(row.id);
        }
      }
    }

    const toDelete = rows.filter((r) => !keep.has(r.id)).map((r) => r.id);
    if (!toDelete.length) return;
    for (let i = 0; i < toDelete.length; i += 50) {
      const chunk = toDelete.slice(i, i + 50);
      await sb.from("finance_store_backups").delete().in("id", chunk);
    }
    if (rows.length < 500) return;
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
