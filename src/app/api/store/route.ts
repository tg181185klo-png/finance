import { NextResponse } from "next/server";
import { mergeStore } from "@/lib/store-merge";
import { readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await readStore();
    return NextResponse.json(store, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const store = mergeStore({});
    return NextResponse.json(
      { ...store, _loadWarning: msg },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
