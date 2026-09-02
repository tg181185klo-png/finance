/**
 * Fix Sep 2 branch transactions showing as Sep 3 00:00 (T20:00 UTC bug).
 * Usage: node scripts/fix-sep2-dates.mjs [YYYY-MM-DD]
 */
const base = process.env.NEXT_PUBLIC_APP_URL || "https://finance-eight-ruddy-60.vercel.app";
const user = process.env.ADMIN_USERNAME || "LASHA";
const pass = process.env.ADMIN_PASSWORD || "12345";
const day = process.argv[2] || "2026-09-02";

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

async function main() {
  const cookie = await login();
  console.log(`Fixing report timestamps for ${day} on ${base}...`);

  const res = await fetch(`${base}/api/branch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action: "fixReportTimestamps", date: day }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || JSON.stringify(data));

  console.log("Result:", data);
  console.log(`Fixed ${data.reports} reports, ${data.transactions} orphan transactions`);
  if (data.sample?.length) {
    console.log("Sample dates after fix:");
    for (const s of data.sample) {
      console.log(`  ${s.date} · ${s.type} · ${s.branch}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
