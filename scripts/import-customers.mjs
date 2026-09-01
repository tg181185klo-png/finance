/**
 * Import customers from gayidvebi.xlsx into the store.
 * Usage: node scripts/import-customers.mjs [path-to-xlsx]
 */
import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const filePath = process.argv[2] || "C:/Users/User/Desktop/gayidvebi.xlsx";

function normalizeId(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rowsByKey = new Map();

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    if (!rows.length) continue;
    const header = rows[0].map((c) => String(c ?? "").trim().toLowerCase());
    const nameIdx = header.findIndex((h) => h.includes("მყიდველ"));
    const idIdx = header.findIndex((h) => h.includes("საიდენტ") || h.includes("მყიდველის კოდ"));
    if (nameIdx < 0) continue;
    const isRegistry = header.some((h) => h.includes("საიდენტ"));

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[nameIdx] ?? "").trim();
      if (!name) continue;
      const companyId = idIdx >= 0 ? normalizeId(row[idIdx]) : "";
      if (isRegistry && !companyId) continue;
      const key = companyId || name.toLowerCase();
      if (!rowsByKey.has(key)) rowsByKey.set(key, { name, companyId });
    }
  }

  const now = new Date().toISOString();
  return [...rowsByKey.values()].map((p) => ({
    id: `imp-${p.companyId || p.name.slice(0, 12)}-${Math.random().toString(36).slice(2, 8)}`,
    personType: "legal",
    isLegacy: true,
    companyName: p.name,
    companyId: p.companyId || undefined,
    registeredAt: now,
    source: "import",
  }));
}

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://finance-eight-ruddy-60.vercel.app";
  const user = process.env.ADMIN_USERNAME || "LASHA";
  const pass = process.env.ADMIN_PASSWORD || "12345";

  const buffer = readFileSync(filePath);
  const incoming = parseWorkbook(buffer);
  console.log(`Parsed ${incoming.length} customers from ${filePath}`);

  const loginRes = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) {
    console.error("Login failed", await loginRes.text());
    process.exit(1);
  }
  const cookie = loginRes.headers.getSetCookie?.()?.[0]?.split(";")[0] ?? "";
  if (!cookie) {
    console.error("No session cookie");
    process.exit(1);
  }

  const form = new FormData();
  form.append("file", new Blob([buffer]), "gayidvebi.xlsx");

  const importRes = await fetch(`${base}/api/clients`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const data = await importRes.json();
  console.log(importRes.status, data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
