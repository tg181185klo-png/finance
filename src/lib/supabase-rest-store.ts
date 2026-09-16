import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./types";
import { mergeStore } from "./store-merge";

/** KERA GROUP — ფინანსების store (Vercel Blob-ის ნაცვლად) */
const DEFAULT_SUPABASE_URL = "https://rtseufuxngkgwmaipqui.supabase.co";
const DEFAULT_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0c2V1ZnV4bmdrZ3dtYWlwcXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjEwOTcsImV4cCI6MjA5ODYzNzA5N30.QNXjkO2b5YFFck72BwiJdpatmPTV8aslxMVMCovhkck";

export class StoreConflictError extends Error {
  constructor(message = "მონაცემები სხვამ უკვე განაახლა — თავიდან ვცდილობთ") {
    super(message);
    this.name = "StoreConflictError";
  }
}

function supabaseRestUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  );
}

function supabaseRestKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON
  );
}

export function hasSupabaseRestStore() {
  return Boolean(supabaseRestUrl() && supabaseRestKey());
}

let client: SupabaseClient | null = null;

export function getSupabaseRestClient() {
  if (!client) {
    client = createClient(supabaseRestUrl(), supabaseRestKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type StoreSnapshot = {
  store: Store;
  updatedAt: string | null;
};

export async function readSupabaseRestSnapshot(): Promise<StoreSnapshot | null> {
  if (!hasSupabaseRestStore()) return null;
  const sb = getSupabaseRestClient();
  const { data, error } = await sb
    .from("finance_store")
    .select("payload, updated_at")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw new Error(`Supabase store read: ${error.message}`);
  if (!data?.payload) return null;
  return {
    store: mergeStore(data.payload as Partial<Store>),
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
  };
}

export async function readFromSupabaseRest(): Promise<Store | null> {
  const snap = await readSupabaseRestSnapshot();
  return snap?.store ?? null;
}

/**
 * იწერს store-ს. თუ expectedUpdatedAt მითითებულია და ბაზაში უკვე სხვა ვერსიაა —
 * StoreConflictError (updateStore ხელახლა სცდის).
 */
export async function writeToSupabaseRest(
  store: Store,
  expectedUpdatedAt?: string | null
): Promise<string> {
  if (!hasSupabaseRestStore()) throw new Error("Supabase REST store not configured");
  const sb = getSupabaseRestClient();
  const payload = JSON.parse(JSON.stringify(store));
  const nextUpdatedAt = new Date().toISOString();

  if (expectedUpdatedAt) {
    const { data, error } = await sb
      .from("finance_store")
      .update({ payload, updated_at: nextUpdatedAt })
      .eq("id", "main")
      .eq("updated_at", expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Supabase store write: ${error.message}`);
    if (!data) {
      const { data: existing, error: readErr } = await sb
        .from("finance_store")
        .select("id, updated_at")
        .eq("id", "main")
        .maybeSingle();
      if (readErr) throw new Error(`Supabase store write: ${readErr.message}`);
      if (!existing) {
        const { error: insErr } = await sb.from("finance_store").upsert(
          { id: "main", payload, updated_at: nextUpdatedAt },
          { onConflict: "id" }
        );
        if (insErr) throw new Error(`Supabase store write: ${insErr.message}`);
        return nextUpdatedAt;
      }
      throw new StoreConflictError();
    }
    return nextUpdatedAt;
  }

  const { error } = await sb.from("finance_store").upsert(
    {
      id: "main",
      payload,
      updated_at: nextUpdatedAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase store write: ${error.message}`);
  return nextUpdatedAt;
}

export async function testSupabaseRest(): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseRestStore()) return { ok: false, error: "Supabase REST not configured" };
  try {
    const sb = getSupabaseRestClient();
    const { error } = await sb.from("finance_store").select("id").eq("id", "main").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
