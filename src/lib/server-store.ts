import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { head, put } from "@vercel/blob";
import type { Branch, Store } from "./types";
import { BRANCHES } from "./constants";
import { env } from "./env";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const BLOB_PATH = "fin-dashboard/store.json";

export const DEFAULT_STORE: Store = {
  transactions: [],
  obligations: {},
  branchTokens: {
    ქუთაისი: "kut-a8f3",
    ლილო: "lil-b2c9",
    დიღომი: "dig-c5e1",
  },
  branchReports: [],
};

function mergeStore(data: Partial<Store>): Store {
  return {
    ...DEFAULT_STORE,
    ...data,
    branchTokens: { ...DEFAULT_STORE.branchTokens, ...data.branchTokens },
    branchReports: data.branchReports ?? [],
  };
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
  try {
    const meta = await head(BLOB_PATH, { token: env.blobToken });
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return mergeStore((await res.json()) as Partial<Store>);
  } catch {
    return null;
  }
}

async function writeToBlob(store: Store) {
  await put(BLOB_PATH, JSON.stringify(store, null, 2), {
    access: "private",
    addRandomSuffix: false,
    token: env.blobToken,
    contentType: "application/json",
    allowOverwrite: true,
  });
}

export async function readStore(): Promise<Store> {
  if (env.blobToken) {
    const blob = await readFromBlob();
    if (blob) return blob;
    await writeToBlob(DEFAULT_STORE);
    return DEFAULT_STORE;
  }

  try {
    return await readFromFile();
  } catch {
    await writeToFile(DEFAULT_STORE);
    return DEFAULT_STORE;
  }
}

export async function writeStore(store: Store) {
  if (env.blobToken) {
    await writeToBlob(store);
    return;
  }
  await writeToFile(store);
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
  if (env.blobToken) return "vercel-blob";
  return "local-file";
}
