import { actionDetail, actionTitle, trimActivityLog } from "./activity-log";
import { listStoreBackups, getStoreBackup } from "./store-backup";
import type { ActivityEntry, Store, Transaction } from "./types";
import { uid } from "./utils";

type Held = {
  tx: Transaction;
  at: string;
  creditPayments?: ActivityEntry["creditPayments"];
  creditDeliveries?: ActivityEntry["creditDeliveries"];
  relatedSale?: Transaction;
};

/** ბექაპშია, ახლანდელ ჩანაწერებში აღარაა — ეს წაშლილია და ბრუნდება. */
export async function recoverDeletedEntries(store: Store): Promise<{
  entries: ActivityEntry[];
  backupId?: string;
}> {
  const backups = await listStoreBackups(15);
  const newestId = backups[0]?.id;
  if (!newestId || store.activityScanBackupId === newestId) {
    return { entries: [], backupId: newestId };
  }
  if ((store.transactions?.length ?? 0) === 0) {
    return { entries: [], backupId: store.activityScanBackupId };
  }

  const live = new Set(store.transactions.map((t) => t.id));
  const already = new Set(
    (store.activityLog ?? []).filter((e) => e.kind === "delete").map((e) => e.txId)
  );
  const held = new Map<string, Held>();

  for (const meta of [...backups].reverse()) {
    const backup = await getStoreBackup(meta.id);
    if (!backup) continue;
    const byId = new Map(backup.payload.transactions.map((t) => [t.id, t]));
    for (const tx of backup.payload.transactions) {
      if (!tx.id || tx.id.startsWith("legacy-")) continue;
      if (live.has(tx.id) || already.has(tx.id)) continue;
      const row: Held = { tx, at: backup.createdAt };
      if (tx.type === "sale") {
        const payments = (backup.payload.creditPayments ?? []).filter((p) => p.saleId === tx.id);
        const deliveries = (backup.payload.creditDeliveries ?? []).filter((d) => d.saleId === tx.id);
        if (payments.length) row.creditPayments = payments;
        if (deliveries.length) row.creditDeliveries = deliveries;
      }
      if (tx.type === "deposit" && tx.linkedCreditPaymentId) {
        const payment = (backup.payload.creditPayments ?? []).find((p) => p.id === tx.linkedCreditPaymentId);
        if (payment) {
          row.creditPayments = [payment];
          const sale = byId.get(payment.saleId);
          if (sale) row.relatedSale = sale;
        }
      }
      held.set(tx.id, row);
    }
  }

  const entries: ActivityEntry[] = [...held.values()].map((row) => ({
    id: uid(),
    at: row.at,
    kind: "delete",
    title: actionTitle("delete", row.tx),
    detail: actionDetail(row.tx),
    txId: row.tx.id,
    before: row.tx,
    creditPayments: row.creditPayments,
    creditDeliveries: row.creditDeliveries,
    relatedSale: row.relatedSale,
  }));

  return { entries, backupId: newestId };
}

export function mergeRecoveredDeletes(store: Store, entries: ActivityEntry[], backupId?: string) {
  if (backupId) store.activityScanBackupId = backupId;
  if (!entries.length) return;
  const live = new Set(store.transactions.map((t) => t.id));
  const have = new Set((store.activityLog ?? []).filter((e) => e.kind === "delete").map((e) => e.txId));
  const fresh = entries.filter((e) => e.before && !live.has(e.txId) && !have.has(e.txId));
  if (!fresh.length) return;
  store.activityLog = trimActivityLog([...fresh, ...(store.activityLog ?? [])]);
}
