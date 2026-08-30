import type { Branch, Sale, Transaction } from "./types";
import { txInPeriod } from "./period-filter";

export type ClientReportRow = {
  key: string;
  name: string;
  phone: string;
  address: string;
  branch: Branch;
  employee: string;
  source: string;
  orders: number;
  lines: number;
  total: number;
  lastDate: string;
};

export type ClientSaleLine = {
  id: string;
  date: string;
  branch: Branch;
  employee: string;
  source: string;
  productName: string;
  quantity: number;
  amount: number;
  clientName: string;
  clientPhone: string;
};

function sourceLabel(source?: string) {
  if (source === "distribucia") return "დისტრიბუცია (აპი)";
  if (source === "branch") return "ფილიალის პორტალი";
  if (source === "import") return "Excel იმპორტი";
  return "ადმინი";
}

export function parseSaleClient(sale: Sale): { name: string; phone: string; address: string } | null {
  const name = sale.buyerName?.trim();
  if (name) {
    const parts = (sale.comment || "").split(" · ").map((p) => p.trim());
    const phone = parts.find((p, i) => i > 0 && /[\d+]/.test(p)) ?? "";
    const address = parts.length > 2 ? parts[parts.length - 1] : "";
    return { name, phone, address: address !== phone ? address : "" };
  }
  if (sale.source === "distribucia" && sale.comment) {
    const parts = sale.comment.split(" · ").map((p) => p.trim());
    if (!parts[0]) return null;
    return {
      name: parts[0],
      phone: parts[1] ?? "",
      address: parts[2] ?? "",
    };
  }
  return null;
}

function orderKey(sale: Sale) {
  return sale.distribuciaOrderId ?? sale.id;
}

export function buildClientReport(transactions: Transaction[], from: string, to: string): ClientReportRow[] {
  const sales = transactions.filter(
    (t): t is Sale => t.type === "sale" && txInPeriod(t.date, from, to)
  );

  const orderGroups = new Map<
    string,
    { client: { name: string; phone: string; address: string }; sales: Sale[] }
  >();

  for (const sale of sales) {
    const client = parseSaleClient(sale);
    if (!client) continue;
    const key = orderKey(sale);
    const group = orderGroups.get(key) ?? { client, sales: [] };
    group.sales.push(sale);
    orderGroups.set(key, group);
  }

  const rows = new Map<string, ClientReportRow>();

  for (const group of orderGroups.values()) {
    const first = group.sales[0];
    const total = group.sales.reduce((s, x) => s + x.amount, 0);
    const employee = first.employeeName?.trim() || "—";
    const rowKey = `${first.branch}|${group.client.name}|${group.client.phone}|${employee}`;
    const existing = rows.get(rowKey);
    const lastDate = group.sales.reduce((max, s) => (s.date > max ? s.date : max), first.date);

    if (existing) {
      existing.orders += 1;
      existing.lines += group.sales.length;
      existing.total += total;
      if (lastDate > existing.lastDate) existing.lastDate = lastDate;
    } else {
      rows.set(rowKey, {
        key: rowKey,
        name: group.client.name,
        phone: group.client.phone,
        address: group.client.address,
        branch: first.branch,
        employee,
        source: sourceLabel(first.source),
        orders: 1,
        lines: group.sales.length,
        total,
        lastDate,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.total - a.total);
}

export function buildClientSaleLines(transactions: Transaction[], from: string, to: string): ClientSaleLine[] {
  return transactions
    .filter((t): t is Sale => t.type === "sale" && txInPeriod(t.date, from, to))
    .map((sale) => {
      const client = parseSaleClient(sale);
      return {
        id: sale.id,
        date: sale.date,
        branch: sale.branch,
        employee: sale.employeeName?.trim() || "—",
        source: sourceLabel(sale.source),
        productName: sale.productName,
        quantity: sale.quantity,
        amount: sale.amount,
        clientName: client?.name ?? "—",
        clientPhone: client?.phone ?? "",
      };
    })
    .filter((l) => l.clientName !== "—")
    .sort((a, b) => b.date.localeCompare(a.date));
}
