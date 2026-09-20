/**
 * Sync distribucia orders from polimeridistribucia.netlify.app into Supabase store.
 * Run: node scripts/sync-distribucia-now.cjs
 */
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "https://polimeridistribucia.netlify.app";
const FROM = process.env.DISTRIBUCIA_SYNC_FROM || "2026-03-01";
const BRANCH = "დისტრიბუცია";

const url = "https://rtseufuxngkgwmaipqui.supabase.co";
const key =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0c2V1ZnV4bmdrZ3dtYWlwcXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjEwOTcsImV4cCI6MjA5ODYzNzA5N30.QNXjkO2b5YFFck72BwiJdpatmPTV8aslxMVMCovhkck";

function isDistribuciaSale(t) {
  return t.type === "sale" && (t.source === "distribucia" || String(t.id || "").startsWith("dist-"));
}

function saleIsoDate(order) {
  if (order.createdAt) return order.createdAt;
  const time = order.saleTime?.match(/^\d{2}:\d{2}/)?.[0] ?? "12:00";
  return `${order.saleDate}T${time}:00.000Z`;
}

function customerComment(order) {
  return [order.storeName, order.storePhone, order.storeAddress].filter(Boolean).join(" · ") || "დისტრიბუცია";
}

function ordersToSales(orders, fromDate, paymentBySaleId, paymentByOrderId) {
  const sales = [];
  for (const order of orders) {
    if (order.deleted || !order.saleDate || order.saleDate < fromDate) continue;
    if (!order.items?.length) continue;
    order.items.forEach((item, index) => {
      const quantity = Number(item.quantity) || 0;
      const amount = Number(item.total) || quantity * Number(item.unitPrice || 0);
      if (quantity <= 0 || amount <= 0) return;
      const saleId = `dist-${order.id}-${index}`;
      sales.push({
        id: saleId,
        type: "sale",
        date: saleIsoDate(order),
        branch: BRANCH,
        productCode: String(item.code || "").trim() || "—",
        productName: String(item.name || item.code || "—").trim(),
        quantity,
        unitPrice: Number(item.unitPrice) || amount / quantity,
        amount,
        paymentStatus: "სრულად გადახდილი",
        paymentMethod:
          paymentBySaleId.get(saleId) ||
          paymentByOrderId.get(order.id) ||
          "ქეში (ნაღდი)",
        comment: customerComment(order),
        buyerName: order.storeName,
        recurrence: "ერთჯერადი",
        source: "distribucia",
        distribuciaOrderId: order.id,
      });
    });
  }
  return sales;
}

async function main() {
  const res = await fetch(`${APP_URL}/api/orders`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`orders API ${res.status}`);
  const data = await res.json();
  const orders = Array.isArray(data.orders) ? data.orders : [];
  console.log("fetched orders", orders.length, "from", APP_URL);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: row, error } = await sb
    .from("finance_store")
    .select("payload, updated_at")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  if (!row?.payload) throw new Error("store empty");

  const store = row.payload;
  store.transactions = store.transactions || [];

  const bakId = `bak-${Date.now()}-pre-distribucia-sync`;
  await sb.from("finance_store_backups").insert({
    id: bakId,
    created_at: new Date().toISOString(),
    reason: "pre-restore",
    source: "distribucia-sync-script",
    payload: store,
    meta: {
      transactions: store.transactions.length,
      employees: (store.employees || []).length,
      branchReports: (store.branchReports || []).length,
      bytes: Buffer.byteLength(JSON.stringify(store)),
    },
  });
  console.log("backup", bakId);

  const replacing = store.transactions.filter((t) => {
    if (!isDistribuciaSale(t)) return false;
    return String(t.date).slice(0, 10) >= FROM;
  });
  const paymentBySaleId = new Map();
  const paymentByOrderId = new Map();
  for (const t of replacing) {
    paymentBySaleId.set(t.id, t.paymentMethod);
    if (t.distribuciaOrderId) paymentByOrderId.set(t.distribuciaOrderId, t.paymentMethod);
  }

  const newSales = ordersToSales(orders, FROM, paymentBySaleId, paymentByOrderId);
  const kept = store.transactions.filter((t) => {
    if (!isDistribuciaSale(t)) return true;
    return String(t.date).slice(0, 10) < FROM;
  });
  const removed = store.transactions.length - kept.length;
  store.transactions = [...newSales, ...kept];

  const revenue = newSales.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const nextAt = new Date().toISOString();
  const { error: writeErr } = await sb
    .from("finance_store")
    .update({ payload: store, updated_at: nextAt })
    .eq("id", "main");
  if (writeErr) throw writeErr;

  console.log({
    from: FROM,
    imported: newSales.length,
    removed,
    kept: kept.length,
    totalTxs: store.transactions.length,
    revenue: Math.round(revenue * 100) / 100,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
