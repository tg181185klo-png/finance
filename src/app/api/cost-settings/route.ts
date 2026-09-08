import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { fetchCostRecipesFromGoogleSheet } from "@/lib/cost-sheet-sync";
import {
  emptyCostSettings,
  emptyMonthCostSettings,
  replaceRecipeFieldValue,
  type CostSettings,
  type MonthCostSettings,
  type ProductCostRecipe,
} from "@/lib/product-cost";
import { updateStore, readStore } from "@/lib/server-store";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

function mergeRecipes(existing: ProductCostRecipe[], incoming: ProductCostRecipe[]): ProductCostRecipe[] {
  const map = new Map(existing.map((r) => [r.code, r]));
  for (const r of incoming) {
    const prev = map.get(r.code);
    if (!prev) {
      map.set(r.code, r);
      continue;
    }
    // შევინარჩუნოთ მომხმარებლის ხელით შეცვლილი ველები თუ უკვე აქვს რეცეპტი —
    // სინქი მხოლოდ ცარიელი/ახალი კოდებისთვის ან სრული განახლება flag-ით
    map.set(r.code, {
      ...r,
      // თუ უკვე იყო ლოკალური ცვლილება, წონა/დრო sheet-იდან, ფასები შეიძლება განახლდეს
      materialPerKg: prev.materialPerKg,
      elecPrice: prev.elecPrice,
      wagePerUnit: prev.wagePerUnit,
      wasteFactor: prev.wasteFactor,
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ka"));
}

export async function GET() {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;
    const store = await readStore();
    return NextResponse.json({
      ok: true,
      costSettings: store.costSettings ?? emptyCostSettings(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "შეცდომა" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      action: "syncSheet" | "saveRecipes" | "saveMonth" | "replaceAll" | "bulkReplace";
      forceSheetDefaults?: boolean;
      recipes?: ProductCostRecipe[];
      month?: string;
      monthSettings?: MonthCostSettings;
      costSettings?: CostSettings;
      branch?: Branch;
      materialPerKg?: number;
      electricityPrice?: number;
      field?: "materialPerKg" | "elecPrice" | "wagePerUnit" | "sellPrice" | "distPrice";
      fromValue?: number;
      toValue?: number;
    };

    if (body.action === "syncSheet") {
      const { recipes, error } = await fetchCostRecipesFromGoogleSheet();
      if (!recipes.length) {
        return NextResponse.json({ error: error || "სინქი ვერ მოხერხდა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const cur = s.costSettings ?? emptyCostSettings();
        s.costSettings = {
          ...cur,
          recipes: body.forceSheetDefaults
            ? recipes
            : mergeRecipes(cur.recipes, recipes),
          syncedAt: new Date().toISOString(),
        };
      });
      return NextResponse.json({
        ok: true,
        costSettings: store.costSettings,
        synced: recipes.length,
      });
    }

    if (body.action === "saveRecipes") {
      if (!Array.isArray(body.recipes)) {
        return NextResponse.json({ error: "recipes საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const cur = s.costSettings ?? emptyCostSettings();
        s.costSettings = { ...cur, recipes: body.recipes! };
      });
      return NextResponse.json({ ok: true, costSettings: store.costSettings });
    }

    if (body.action === "saveMonth") {
      const month = body.month?.trim();
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ error: "month YYYY-MM ფორმატით" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const cur = s.costSettings ?? emptyCostSettings();
        const months = { ...cur.months };
        const base = months[month] ?? emptyMonthCostSettings();
        if (body.monthSettings) {
          months[month] = body.monthSettings;
        } else if (body.branch) {
          months[month] = {
            ...base,
            branches: {
              ...base.branches,
              [body.branch]: {
                materialPerKg: Number(body.materialPerKg) || 0,
                electricityPrice:
                  body.electricityPrice != null && body.electricityPrice > 0
                    ? Number(body.electricityPrice)
                    : undefined,
              },
            },
          };
        } else {
          throw new Error("monthSettings ან branch საჭიროა");
        }
        s.costSettings = { ...cur, months };
      });
      return NextResponse.json({ ok: true, costSettings: store.costSettings });
    }

    if (body.action === "replaceAll" && body.costSettings) {
      const store = await updateStore((s) => {
        s.costSettings = body.costSettings!;
      });
      return NextResponse.json({ ok: true, costSettings: store.costSettings });
    }

    if (body.action === "bulkReplace") {
      const field = body.field;
      const fromValue = Number(body.fromValue);
      const toValue = Number(body.toValue);
      if (!field || !Number.isFinite(fromValue) || !Number.isFinite(toValue)) {
        return NextResponse.json({ error: "field, fromValue, toValue საჭიროა" }, { status: 400 });
      }

      let changed = 0;
      const store = await updateStore((s) => {
        const cur = s.costSettings ?? emptyCostSettings();
        const result = replaceRecipeFieldValue(cur.recipes, field, fromValue, toValue);
        changed = result.changed;
        const months = { ...cur.months };
        if (field === "materialPerKg") {
          const fromR = Math.round(fromValue * 100) / 100;
          const toR = Math.round(toValue * 100) / 100;
          for (const [mKey, mVal] of Object.entries(months)) {
            const branches = { ...mVal.branches };
            let touched = false;
            for (const [bKey, bVal] of Object.entries(branches)) {
              if (!bVal) continue;
              const curMat = Math.round((bVal.materialPerKg || 0) * 100) / 100;
              if (curMat === fromR) {
                branches[bKey as Branch] = { ...bVal, materialPerKg: toR };
                touched = true;
              }
            }
            if (touched) months[mKey] = { ...mVal, branches };
          }
        }
        s.costSettings = { ...cur, recipes: result.recipes, months };
      });

      return NextResponse.json({
        ok: true,
        costSettings: store.costSettings,
        changed,
      });
    }

    return NextResponse.json({ error: "უცნობი action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "შეცდომა" },
      { status: 500 }
    );
  }
}
