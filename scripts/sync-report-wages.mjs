/**
 * Sync Lilo/Digomi daily wages from branch reports + fix obligations.
 * Usage: node scripts/sync-report-wages.mjs
 */
const base = process.env.NEXT_PUBLIC_APP_URL || "https://finance-eight-ruddy-60.vercel.app";
const user = process.env.ADMIN_USERNAME || "LASHA";
const pass = process.env.ADMIN_PASSWORD || "12345";

async function login() {
  const res = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  const cookie = res.headers.getSetCookie?.()?.[0]?.split(";")[0] ?? "";
  if (!cookie) throw new Error("No session cookie");
  return cookie;
}

async function api(cookie, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

async function main() {
  const cookie = await login();

  const storeRes = await fetch(`${base}/api/store`, { headers: { Cookie: cookie } });
  const store = await storeRes.json();
  const ninoA = (store.employees ?? []).find((e) => e.name.includes("ანსიან"));
  if (ninoA && ninoA.dailyWage <= 0) {
    console.log(`Updating ${ninoA.name} daily wage 0 → 50`);
    await api(cookie, "/api/employees", {
      action: "updateEmployee",
      employeeId: ninoA.id,
      dailyWage: 50,
    });
  }

  console.log("Syncing attendance from branch reports (2026-09-01+)...");
  const result = await api(cookie, "/api/employees", {
    action: "syncFromReports",
    fromDate: "2026-09-01",
  });
  console.log(result);

  const after = await fetch(`${base}/api/store`, { headers: { Cookie: cookie } }).then((r) => r.json());
  const sep = after.obligations?.["2026-09"]?.filter((o) => o.category === "ხელფასი") ?? [];
  console.log("\nSeptember wage obligations:");
  for (const o of sep) {
    console.log(`  ${o.name}: ${o.amount} ₾ (paid ${o.paid})`);
  }
  console.log("\nSeptember attendance (Lilo/Digomi):");
  for (const a of (after.attendance ?? []).filter((x) => x.date.startsWith("2026-09"))) {
    const e = (after.employees ?? []).find((emp) => emp.id === a.employeeId);
    if (e && ["ლილო", "დიღომი"].includes(e.branch)) {
      console.log(`  ${a.date} ${a.employeeName} (${e.branch}): ${a.wageAmount} ₾`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
