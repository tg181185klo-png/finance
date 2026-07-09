import type { Product } from "./types";
import { env, PRODUCT_SHEETS } from "./sheets-config";

function sheetCsvUrl(name: string, gid?: string) {
  const base = `https://docs.google.com/spreadsheets/d/${env.googleSheetId}`;
  if (gid) return `${base}/export?format=csv&gid=${gid}`;
  return `${base}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || (c === "\r" && n === "\n")) {
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
      if (c === "\r") i++;
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

function colIndex(headers: string[], ...keys: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const k of keys) {
    const i = headers.findIndex((h) => norm(h) === norm(k) || norm(h).includes(norm(k)));
    if (i >= 0) return i;
  }
  return -1;
}

function priceCol(headers: string[]) {
  const exact = headers.findIndex((h) => h.trim() === "გასაყიდი ფასი");
  if (exact >= 0) return exact;
  return headers.findIndex((h) => h.includes("გასაყიდი ფასი") && !h.includes("დღგ გარეშე") && !h.includes("სულ"));
}

function parseRows(rows: string[][], map: Map<string, Product>) {
  if (!rows.length) return;
  const headers = rows[0].map((h) => h.trim());
  const codeIdx = colIndex(headers, "კოდი", "ბარკოდი");
  const nameIdx = colIndex(headers, "პროდუქტი", "დასახელება");
  const priceIdx = priceCol(headers);
  if (codeIdx < 0 || nameIdx < 0 || priceIdx < 0) return;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = (row[codeIdx] ?? "").trim();
    const name = (row[nameIdx] ?? "").trim();
    const price = parseFloat((row[priceIdx] ?? "").replace(",", "."));
    if (!code || !name || !Number.isFinite(price) || price <= 0) continue;
    if (!map.has(code)) map.set(code, { code, name, price });
  }
}

export async function fetchProductsFromGoogleSheets(): Promise<{ products: Product[]; error?: string }> {
  const map = new Map<string, Product>();
  let lastErr = "";

  for (const sheet of PRODUCT_SHEETS) {
    const url = sheetCsvUrl(sheet.name, sheet.gid || undefined);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "FinDashboard/1.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (text.includes("Sign in") || text.includes("<!DOCTYPE html") || text.includes("accounts.google.com")) {
        lastErr = "ფურცელი კერძოა — გააზიარეთ „ინტერნეტზე ყველას“";
        continue;
      }
      parseRows(parseCsv(text), map);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "შეცდომა";
    }
  }

  const products = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ka"));
  if (!products.length && lastErr) return { products: [], error: lastErr };
  return { products, error: products.length ? undefined : lastErr };
}
