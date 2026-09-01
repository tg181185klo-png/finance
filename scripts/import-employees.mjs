/**
 * Import employees from tanamshromlebi.xlsx into the store.
 * Usage: node scripts/import-employees.mjs [path-to-xlsx]
 */
import { readFileSync } from "fs";

const filePath = process.argv[2] || "C:/Users/User/Downloads/tanamshromlebi.xlsx";

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://finance-eight-ruddy-60.vercel.app";
  const user = process.env.ADMIN_USERNAME || "LASHA";
  const pass = process.env.ADMIN_PASSWORD || "12345";

  const buffer = readFileSync(filePath);
  console.log(`Importing employees from ${filePath} (${buffer.length} bytes)`);

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
  form.append("file", new Blob([buffer]), "tanamshromlebi.xlsx");

  const importRes = await fetch(`${base}/api/employees`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const data = await importRes.json();
  console.log(importRes.status, data);
  if (!importRes.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
