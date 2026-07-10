import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { head, put } from "@vercel/blob";
import type { PutCommandOptions } from "@vercel/blob";
import type { Branch, BranchCash, BranchInventory, Store } from "./types";
import { BRANCHES } from "./constants";
import { emptyBranchCash, emptyInventory, ensureMonthObligations, currentMonth } from "./utils";
import { env } from "./env";
import { hasPostgres, readFromPostgres, writeToPostgres } from "./db";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_PATH = "fin-dashboard/store.json";

function hasBlobStorage() {
  return Boolean(
    env.blobToken || process.env.VERCEL_OIDC_TOKEN || process.env.BLOB_STORE_ID,
  );
}

export const DEFAULT_STORE: Store = {
  transactions: [],
  obligations: {},
  branchTokens: {
    ქუთაისი: "kut-a8f3",
    ლილო: "lil-b2c9",
    დიღომი: "dig-c5e1",
  },
  branchReports: [],
  inventory: emptyInventory(),
  branchCash: {
    ქუთაისი: emptyBranchCash(),
    ლილო: emptyBranchCash(),
    დიღომი: emptyBranchCash(),
  },
  recurringObligations: [],
  obligationPayments: [],
};

function mergeBranchCash(data?: Partial<Record<Branch, BranchCash>>): Record<Branch, BranchCash> {
  const base = DEFAULT_STORE.branchCash;
  const out = { ...base };
  for (const b of BRANCHES) {
    out[b] = { ...base[b], ...data?.[b] };
  }
  return out;
}

function mergeInventory(data?: Partial<Record<Branch, BranchInventory>>): Record<Branch, BranchInventory> {
  const base = emptyInventory();
  const out = { ...base };
  for (const b of BRANCHES) {
    out[b] = { ...base[b], ...data?.[b] };
  }
  return out;
}

function mergeStore(data: Partial<Store>): Store {
  return {
    ...DEFAULT_STORE,
    ...data,
    branchTokens: { ...DEFAULT_STORE.branchTokens, ...data.branchTokens },
    branchReports: data.branchReports ?? [],
    inventory: mergeInventory(data.inventory),
    branchCash: mergeBranchCash(data.branchCash),
    recurringObligations: data.recurringObligations ?? [],
    obligationPayments: data.obligationPayments ?? [],
  };
}

async function loadStoreRaw(): Promise<Store | null> {
  if (hasPostgres()) {
    try {
      const pg = await readFromPostgres();
      if (pg) return mergeStore(pg);
    } catch {
      // fall through to blob
    }
  }
  if (hasBlobStorage()) {
    return await readFromBlob();
  }
  try {
    return await readFromFile();
  } catch {
    return null;
  }
}

async function persistStore(store: Store) {
  if (hasPostgres()) {
    try {
      await writeToPostgres(store);
      return;
    } catch {
      // fall through
    }
  }
  if (hasBlobStorage()) {
    await writeToBlob(store);
    return;
  }
  await writeToFile(store);
}

async function migrateBlobToPostgresIfNeeded() {
  if (!hasPostgres()) return;
  const existing = await readFromPostgres();
  if (existing) return;
  const blob = hasBlobStorage() ? await readFromBlob() : null;
  const file = blob ?? (await readFromFile().catch(() => null));
  if (file) await writeToPostgres(mergeStore(file));
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
    } catch {
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
  await migrateBlobToPostgresIfNeeded();
  const loaded = await loadStoreRaw();
  const store = loaded ?? { ...DEFAULT_STORE };

  const months = new Set([currentMonth()]);
  for (const m of Object.keys(store.obligations)) months.add(m);

  let changed = false;
  for (const m of months) {
    if (ensureMonthObligations(store, m)) changed = true;
  }

  if (!loaded) {
    await persistStore(store);
    return store;
  }
  if (changed) await persistStore(store);
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

export function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

export function storageMode() {
  if (hasPostgres()) return "vercel-postgres";
  if (hasBlobStorage()) return "vercel-blob";
  return "local-file";
}
