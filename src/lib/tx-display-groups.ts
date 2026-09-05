import type { Sale, Transaction } from "./types";
import { saleGroupKey, saleGroupLabel } from "./branch-payments";

export type TxDisplayGroup = {
  key: string;
  primary: Transaction;
  items: Transaction[];
  amount: number;
  productCount: number;
};

/** გაყიდვები ერთიანდება შეკვეთით; ხარჯი/შენატანი ცალკე რჩება */
export function groupTransactionsForDisplay(rows: Transaction[]): TxDisplayGroup[] {
  const saleGroups = new Map<string, Sale[]>();
  const others: Transaction[] = [];

  for (const t of rows) {
    if (t.type === "sale") {
      const key = saleGroupKey(t);
      const list = saleGroups.get(key) ?? [];
      list.push(t);
      saleGroups.set(key, list);
    } else {
      others.push(t);
    }
  }

  const groups: TxDisplayGroup[] = [];

  for (const [key, sales] of saleGroups) {
    sales.sort((a, b) => a.productName.localeCompare(b.productName, "ka"));
    const primary = [...sales].sort((a, b) => b.date.localeCompare(a.date))[0];
    groups.push({
      key,
      primary,
      items: sales,
      amount: sales.reduce((s, x) => s + x.amount, 0),
      productCount: sales.length,
    });
  }

  for (const t of others) {
    groups.push({
      key: `tx:${t.id}`,
      primary: t,
      items: [t],
      amount: t.amount,
      productCount: 1,
    });
  }

  return groups.sort((a, b) => {
    const byDate = b.primary.date.localeCompare(a.primary.date);
    if (byDate !== 0) return byDate;
    return b.key.localeCompare(a.key);
  });
}

export function saleGroupDescription(sales: Sale[]) {
  const label = saleGroupLabel(sales[0]);
  if (sales.length === 1) {
    return `${sales[0].productName} × ${sales[0].quantity}`;
  }
  const buyer = sales[0].buyerName?.trim();
  if (buyer) return `${buyer} · ${sales.length} პროდუქტი`;
  return `${label} · ${sales.length} პროდუქტი`;
}
