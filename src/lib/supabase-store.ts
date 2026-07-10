import { createClient } from "@supabase/supabase-js";
import type { Store } from "./types";
import { mergeStore } from "./store-merge";

const STORE_OBJECT = "finance-store.json";

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

function supabaseServiceKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

export function supabaseBucket() {
  return process.env.SUPABASE_STORE_BUCKET || "store";
}

export function hasSupabaseStorage() {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

function getClient() {
  const url = supabaseUrl();
  const key = supabaseServiceKey();
  if (!url || !key) throw new Error("Supabase storage not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function readFromSupabaseStorage(): Promise<Store | null> {
  if (!hasSupabaseStorage()) return null;
  const supabase = getClient();
  const bucket = supabaseBucket();
  const { data, error } = await supabase.storage.from(bucket).download(STORE_OBJECT);
  if (error) {
    if (error.message?.includes("not found") || (error as { statusCode?: string }).statusCode === "404") {
      return null;
    }
    throw error;
  }
  const text = await data.text();
  return mergeStore(JSON.parse(text) as Partial<Store>);
}

export async function writeToSupabaseStorage(store: Store) {
  if (!hasSupabaseStorage()) throw new Error("Supabase storage not configured");
  const supabase = getClient();
  const bucket = supabaseBucket();
  const body = JSON.stringify(store, null, 2);
  const { error } = await supabase.storage.from(bucket).upload(STORE_OBJECT, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "no-cache",
  });
  if (error) throw error;
}

export async function testSupabaseStorage(): Promise<{ ok: boolean; error?: string; bucket?: string }> {
  if (!hasSupabaseStorage()) return { ok: false, error: "SUPABASE_URL or SUPABASE_SECRET_KEY not set" };
  try {
    const supabase = getClient();
    const bucket = supabaseBucket();
    const { error } = await supabase.storage.from(bucket).list("", { limit: 1 });
    if (error) return { ok: false, error: error.message, bucket };
    return { ok: true, bucket };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg, bucket: supabaseBucket() };
  }
}
