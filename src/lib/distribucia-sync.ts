import { env } from "./sheets-config";
import type { Branch, Sale } from "./types";

export const DISTRIBUCIA_APP_URL = env.distribuciaApiUrl.replace(/\/$/, "");

export const DISTRIBUCIA_SYNC_FROM = process.env.DISTRIBUCIA_SYNC_FROM || "2026-03-01";

export type DistribuciaItem = {
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type DistribuciaOrder = {
  id: string;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  saleDate: string;
  saleTime?: string;
  status?: string;
  notes?: string;
  items: DistribuciaItem[];
  totalAmount: number;
  deleted?: boolean;
  createdAt?: string;
};

export type DistribuciaDayCustomer = {
  storeName: string;
  storePhone: string;
  orders: number;
  units: number;
  total: number;
};

export type DistribuciaDaySummary = {
  date: string;
  orders: number;
  customers: number;
  units: number;
  revenue: number;
  byCustomer: DistribuciaDayCustomer[];
};

export type DistribuciaSyncPreview = {
  fromDate: string;
  orders: number;
  lines: number;
  revenue: number;
  days: DistribuciaDaySummary[];
};

export async function fetchDistribuciaOrders(): Promise<DistribuciaOrder[]> {
  const res = await fetch(`${DISTRIBUCIA_APP_URL}/api/orders`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`დისტრიბუციის API პასუხი: ${res.status}`);
  }
  const data = (await res.json()) as { orders?: DistribuciaOrder[] };
  return Array.isArray(data.orders) ? data.orders : [];
}

function saleIsoDate(order: DistribuciaOrder): string {
  if (order.createdAt) return order.createdAt;
  const time = order.saleTime?.match(/^\d{2}:\d{2}/)?.[0] ?? "12:00";
  return `${order.saleDate}T${time}:00.000Z`;
}

function customerComment(order: DistribuciaOrder): string {
  const parts = [order.storeName, order.storePhone, order.storeAddress].filter(Boolean);
  return parts.join(" · ") || order.storeName || "დისტრიბუცია";
}

export function distribuciaSaleId(orderId: string, itemIndex: number) {
  return `dist-${orderId}-${itemIndex}`;
}

export function isDistribuciaSaleId(id: string) {
  return id.startsWith("dist-");
}

export function ordersFromDate(orders: DistribuciaOrder[], fromDate: string) {
  return orders.filter((o) => !o.deleted && o.saleDate >= fromDate);
}

export function ordersToSales(orders: DistribuciaOrder[], fromDate: string, branch: Branch = "დისტრიბუცია"): Sale[] {
  const sales: Sale[] = [];
  for (const order of ordersFromDate(orders, fromDate)) {
    if (!order.items?.length) continue;
    order.items.forEach((item, index) => {
      const quantity = Number(item.quantity) || 0;
      const amount = Number(item.total) || quantity * Number(item.unitPrice || 0);
      if (quantity <= 0 || amount <= 0) return;
      sales.push({
        id: distribuciaSaleId(order.id, index),
        type: "sale",
        date: saleIsoDate(order),
        branch,
        productCode: String(item.code || "").trim() || "—",
        productName: String(item.name || item.code || "—").trim(),
        quantity,
        unitPrice: Number(item.unitPrice) || amount / quantity,
        amount,
        paymentStatus: "სრულად გადახდილი",
        paymentMethod: "ანგარიშზე ჩარიცხვა",
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

export function buildDistribuciaDailySummary(orders: DistribuciaOrder[], fromDate: string): DistribuciaDaySummary[] {
  const byDay = new Map<string, DistribuciaOrder[]>();
  for (const order of ordersFromDate(orders, fromDate)) {
    const list = byDay.get(order.saleDate) ?? [];
    list.push(order);
    byDay.set(order.saleDate, list);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayOrders]) => {
      const customerMap = new Map<string, DistribuciaDayCustomer>();
      let units = 0;
      let revenue = 0;

      for (const order of dayOrders) {
        revenue += Number(order.totalAmount) || 0;
        const key = `${order.storeName}|${order.storePhone ?? ""}`;
        const cur = customerMap.get(key) ?? {
          storeName: order.storeName,
          storePhone: order.storePhone ?? "",
          orders: 0,
          units: 0,
          total: 0,
        };
        cur.orders += 1;
        cur.total += Number(order.totalAmount) || 0;
        for (const item of order.items ?? []) {
          cur.units += Number(item.quantity) || 0;
          units += Number(item.quantity) || 0;
        }
        customerMap.set(key, cur);
      }

      return {
        date,
        orders: dayOrders.length,
        customers: customerMap.size,
        units,
        revenue,
        byCustomer: [...customerMap.values()].sort((a, b) => b.total - a.total),
      };
    });
}

export function buildDistribuciaPreview(orders: DistribuciaOrder[], fromDate: string): DistribuciaSyncPreview {
  const filtered = ordersFromDate(orders, fromDate);
  const days = buildDistribuciaDailySummary(orders, fromDate);
  const sales = ordersToSales(filtered, fromDate);
  return {
    fromDate,
    orders: filtered.length,
    lines: sales.length,
    revenue: days.reduce((s, d) => s + d.revenue, 0),
    days,
  };
}

export function removeDistribuciaSales<T extends { id: string; source?: string; date: string }>(
  transactions: T[],
  fromDate: string
): T[] {
  return transactions.filter((t) => {
    if (t.source !== "distribucia" && !isDistribuciaSaleId(t.id)) return true;
    return t.date.slice(0, 10) < fromDate;
  });
}

export function mergeDistribuciaSales(
  transactions: Sale[],
  newSales: Sale[],
  fromDate: string
): Sale[] {
  const kept = removeDistribuciaSales(transactions, fromDate);
  const existingIds = new Set(kept.map((t) => t.id));
  const toAdd = newSales.filter((s) => !existingIds.has(s.id));
  return [...toAdd, ...kept];
}
