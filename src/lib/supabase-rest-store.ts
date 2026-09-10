import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./types";
import { mergeStore } from "./store-merge";

/** KERA GROUP — ფინანსების store (Vercel Blob-ის ნაცვლად) */
const DEFAULT_SUPABASE_URL = "https://rtseufuxngkgwmaipqui.supabase.co";
const DEFAULT_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0c2V1ZnV4bmdrZ3dtYWlwcXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjEwOTcsImV4cCI6MjA5ODYzNzA5N30.QNXjkO2b5YFFck72BwiJdpatmPTV8aslxMVMCovhkck";

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

export async function readFromSupabaseRest(): Promise<Store | null> {
  if (!hasSupabaseRestStore()) return null;
  const sb = getSupabaseRestClient();
  const { data, error } = await sb.from("finance_store").select("payload").eq("id", "main").maybeSingle();
  if (error) throw new Error(`Supabase store read: ${error.message}`);
  if (!data?.payload) return null;
  return mergeStore(data.payload as Partial<Store>);
}

export async function writeToSupabaseRest(store: Store) {
  if (!hasSupabaseRestStore()) throw new Error("Supabase REST store not configured");
  const sb = getSupabaseRestClient();
  const payload = JSON.parse(JSON.stringify(store));
  const { error } = await sb.from("finance_store").upsert(
    {
      id: "main",
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase store write: ${error.message}`);

  // ისტორიული ასლი — თუ Blob ისევ გაფუჭდება, აქედან აღდგება
  const { maybeCreateAutoBackup } = await import("./store-backup");
  maybeCreateAutoBackup(store, "supabase-rest").catch(() => {});
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
