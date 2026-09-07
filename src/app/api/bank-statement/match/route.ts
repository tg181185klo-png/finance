import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { readStore, updateStore } from "@/lib/server-store";
import { runBankStatementMatch } from "@/lib/bank-statement";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel ამონაწერი საჭიროა" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const store = await readStore();
    const result = runBankStatementMatch(buffer, store.transactions);

    let bankLedgerReviewed = store.bankLedgerReviewed ?? {};
    const matchedIds = result.summary.matchedIds;
    if (matchedIds.length > 0) {
      const now = new Date().toISOString();
      const updated = await updateStore((s) => {
        if (!s.bankLedgerReviewed) s.bankLedgerReviewed = {};
        for (const id of matchedIds) {
          s.bankLedgerReviewed![id] = now;
        }
      });
      bankLedgerReviewed = updated.bankLedgerReviewed ?? {};
    }

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      marked: matchedIds.length,
      bankLedgerReviewed,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "შედარება ვერ მოხერხდა" },
      { status: 400 }
    );
  }
}
