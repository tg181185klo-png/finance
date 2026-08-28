"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Employee,
  ExpenseCategory,
  ExpensePaymentMethod,
  PaymentMethod,
  Product,
} from "@/lib/types";
import { BRANCH_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, PAYMENT_METHODS } from "@/lib/dashboard-data";
import { formatMoney, uid } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const btnCls = "w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800";

type ProductRow = {
  id: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: string;
  search: string;
  showList: boolean;
};

type ClientSaleRow = {
  id: string;
  firstName: string;
  lastName: string;
  personalId: string;
  phone: string;
  paymentMethod: PaymentMethod;
  products: ProductRow[];
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
};

function emptyProduct(): ProductRow {
  return {
    id: uid(),
    productCode: "",
    productName: "",
    unitPrice: 0,
    quantity: "1",
    search: "",
    showList: false,
  };
}

function emptyClient(): ClientSaleRow {
  return {
    id: uid(),
    firstName: "",
    lastName: "",
    personalId: "",
    phone: "",
    paymentMethod: "ქეში (ნაღდი)",
    products: [emptyProduct()],
  };
}

function emptyExpense(): ExpenseRow {
  return { id: uid(), category: "სხვა", amount: "", paymentMethod: "ქეში (ნაღდი)", comment: "" };
}

function matchProducts(products: Product[], query: string, limit = 12): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return products.slice(0, limit);
  const byCode = products.filter((p) => p.code.toLowerCase().includes(q));
  const byName = products.filter(
    (p) => p.name.toLowerCase().includes(q) && !byCode.some((x) => x.code === p.code)
  );
  return [...byCode, ...byName].slice(0, limit);
}

export default function BranchPortal({ token }: { token: string }) {
  const [branch, setBranch] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productWarning, setProductWarning] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [clients, setClients] = useState<ClientSaleRow[]>([emptyClient()]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/branch?token=${token}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/products", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([branchData, productData]) => {
        if (branchData.error) setErr(branchData.error);
        else {
          setBranch(branchData.branch);
          const list: Employee[] = branchData.employees ?? [];
          setEmployees(list);
          if (list.length === 1) setSelectedEmployeeId(list[0].id);
        }
        setProducts((productData.products ?? []) as Product[]);
        if (productData.warning) setProductWarning(String(productData.warning));
        else if (productData.error && !(productData.products ?? []).length) {
          setProductWarning(String(productData.error));
        }
      })
      .catch(() => setErr("კავშირის შეცდომა"))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const salesTotal = useMemo(
    () =>
      clients.reduce(
        (sum, c) =>
          sum +
          c.products.reduce((s, p) => {
            const q = parseFloat(p.quantity) || 0;
            return s + q * (p.unitPrice || 0);
          }, 0),
        0
      ),
    [clients]
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [expenses]
  );

  function updateClient(id: string, patch: Partial<ClientSaleRow>) {
    setClients((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateProduct(clientId: string, productId: string, patch: Partial<ProductRow>) {
    setClients((rows) =>
      rows.map((c) =>
        c.id !== clientId
          ? c
          : { ...c, products: c.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)) }
      )
    );
  }

  function pickProduct(clientId: string, productId: string, product: Product) {
    updateProduct(clientId, productId, {
      productCode: product.code,
      productName: product.name,
      unitPrice: product.price,
      search: `${product.code} — ${product.name}`,
      showList: false,
    });
  }

  function clearProduct(clientId: string, productId: string) {
    updateProduct(clientId, productId, {
      productCode: "",
      productName: "",
      unitPrice: 0,
      search: "",
      showList: true,
    });
  }

  async function submit(e: React.FormEvent, asZero = false) {
    e.preventDefault();
    if (submitting) return;

    if (!selectedEmployeeId) {
      setErr("აირჩიეთ გამომგზავნის სახელი და გვარი");
      return;
    }
    if (employees.length === 0) {
      setErr("ამ ფილიალში თანამშრომელი ჯერ არ არის დამატებული ადმინ პანელიდან");
      return;
    }

    const validClients = clients
      .map((c) => {
        const productsValid = c.products
          .filter((p) => p.productCode && (parseFloat(p.quantity) || 0) > 0)
          .map((p) => {
            const quantity = parseFloat(p.quantity) || 0;
            return {
              productCode: p.productCode,
              productName: p.productName,
              quantity,
              unitPrice: p.unitPrice,
              amount: quantity * p.unitPrice,
              paymentMethod: c.paymentMethod,
            };
          });
        return {
          customerFirstName: c.firstName.trim(),
          customerLastName: c.lastName.trim(),
          personalId: c.personalId.trim() || undefined,
          phone: c.phone.trim(),
          paymentMethod: c.paymentMethod,
          products: productsValid,
        };
      })
      .filter(
        (c) => c.customerFirstName && c.customerLastName && c.phone && c.products.length > 0
      );

    const validExpenses = expenses
      .filter((r) => parseFloat(r.amount) > 0)
      .map((r) => ({
        category: r.category,
        amount: parseFloat(r.amount),
        paymentMethod: r.paymentMethod,
        comment: r.comment.trim() || r.category,
      }));

    const incomplete = clients.some((c) => {
      const started =
        c.firstName.trim() ||
        c.lastName.trim() ||
        c.phone.trim() ||
        c.personalId.trim() ||
        c.products.some((p) => p.productCode || p.search.trim());
      if (!started) return false;
      const hasName = c.firstName.trim() && c.lastName.trim();
      const hasPhone = c.phone.trim();
      const hasProduct = c.products.some((p) => p.productCode && (parseFloat(p.quantity) || 0) > 0);
      return !(hasName && hasPhone && hasProduct);
    });
    if (!asZero && incomplete) {
      setErr("კლიენტისთვის შეავსეთ სახელი, გვარი, ტელეფონი და მინიმუმ ერთი საქონელი");
      return;
    }

    const zeroReport = asZero || (validClients.length === 0 && validExpenses.length === 0);

    setSubmitting(true);
    setErr("");
    setOk(false);
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date,
          clientSales: asZero ? [] : validClients,
          expenses: asZero ? [] : validExpenses,
          submittedBy: selectedEmployee?.name,
          submittedEmployeeId: selectedEmployeeId,
          zeroReport,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "შეცდომა");
        return;
      }
      setOk(true);
      setClients([emptyClient()]);
      setExpenses([]);
    } catch {
      setErr("კავშირის შეცდომა");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">იტვირთება...</div>;
  }
  if (err && !branch) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">{err}</div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-6 text-zinc-100">
      <h1 className="text-xl font-bold">{branch}</h1>
      <p className="mb-4 text-sm text-zinc-500">დღის რეპორტი — კლიენტები, გაყიდვები და სამუშაო დღე</p>

      {ok && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          გაგზავნილია! ამ დღის დღიური ხელფასი დაერიცხა.
        </div>
      )}
      {err && branch && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>
      )}

      <form onSubmit={(e) => submit(e, false)} className="space-y-6">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">თარიღი</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        <section className="rounded-xl border border-teal-900/40 bg-zinc-900/40 p-4">
          <h2 className="mb-3 font-semibold text-teal-300">გამომგზავნის სახელი და გვარი</h2>
          {employees.length === 0 ? (
            <p className="text-sm text-amber-300">
              თანამშრომელი ჯერ არ არის დამატებული. დაამატეთ ადმინ პანელიდან ამ ფილიალისთვის (მაგ: ნინო).
            </p>
          ) : (
            <>
              <select
                className={inputCls}
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                required
              >
                <option value="">აირჩიეთ თანამშრომელი...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              {selectedEmployee && (
                <p className="mt-2 text-xs text-teal-300">
                  დღიური ხელფასი: {formatMoney(selectedEmployee.dailyWage)} — რეპორტის გაგზავნისას ამ თარიღზე დაერიცხება.
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-xl border border-emerald-900/40 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-emerald-400">შემოსავლები / კლიენტები</h2>
            <button type="button" className={smallBtn} onClick={() => setClients((s) => [...s, emptyClient()])}>
              + კლიენტი
            </button>
          </div>
          <p className="mb-2 text-xs text-zinc-500">
            საქონელი აირჩიე სიიდან, ან ჩაწერე კოდი / დასახელება — გამოჩნდება შესაბამისი ვარიანტები Google Sheets / Drive ბაზიდან, გასაყიდი ფასით.
          </p>
          {productWarning && <p className="mb-2 text-xs text-amber-300">{productWarning}</p>}
          {products.length === 0 && (
            <p className="mb-3 text-xs text-amber-300">პროდუქტების სია ცარიელია — შეამოწმეთ Sheets გაზიარება.</p>
          )}

          <div className="space-y-4">
            {clients.map((client, ci) => (
              <div key={client.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 flex justify-between text-xs text-zinc-500">
                  <span>კლიენტი #{ci + 1}</span>
                  {clients.length > 1 && (
                    <button
                      type="button"
                      className="text-red-400"
                      onClick={() => setClients((s) => s.filter((x) => x.id !== client.id))}
                    >
                      წაშლა
                    </button>
                  )}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">სახელი</label>
                    <input
                      className={inputCls}
                      value={client.firstName}
                      onChange={(e) => updateClient(client.id, { firstName: e.target.value })}
                      placeholder="სახელი"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">გვარი</label>
                    <input
                      className={inputCls}
                      value={client.lastName}
                      onChange={(e) => updateClient(client.id, { lastName: e.target.value })}
                      placeholder="გვარი"
                    />
                  </div>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">პირადი ნომერი (არასავალდებულო)</label>
                    <input
                      className={inputCls}
                      value={client.personalId}
                      onChange={(e) => updateClient(client.id, { personalId: e.target.value })}
                      placeholder="არასავალდებულო"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">ტელეფონი</label>
                    <input
                      className={inputCls}
                      value={client.phone}
                      onChange={(e) => updateClient(client.id, { phone: e.target.value })}
                      placeholder="5xxxxxxxx"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1 block text-xs text-zinc-400">გადახდის მეთოდი</label>
                  <select
                    className={inputCls}
                    value={client.paymentMethod}
                    onChange={(e) =>
                      updateClient(client.id, { paymentMethod: e.target.value as PaymentMethod })
                    }
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-zinc-300">საქონელი</h3>
                  <button
                    type="button"
                    className={smallBtn}
                    onClick={() =>
                      updateClient(client.id, { products: [...client.products, emptyProduct()] })
                    }
                  >
                    + საქონელი
                  </button>
                </div>

                <div className="space-y-3">
                  {client.products.map((prod, pi) => {
                    const suggestions = matchProducts(products, prod.search);
                    return (
                      <div key={prod.id} className="rounded-lg border border-zinc-800/80 p-2">
                        <div className="mb-1 flex justify-between text-xs text-zinc-500">
                          <span>საქონელი #{pi + 1}</span>
                          {client.products.length > 1 && (
                            <button
                              type="button"
                              className="text-red-400"
                              onClick={() =>
                                updateClient(client.id, {
                                  products: client.products.filter((p) => p.id !== prod.id),
                                })
                              }
                            >
                              წაშლა
                            </button>
                          )}
                        </div>

                        <label className="mb-1 block text-xs text-zinc-400">
                          პროდუქტი (სია / კოდი / დასახელება)
                        </label>
                        <div className="relative">
                          <input
                            className={inputCls}
                            value={
                              prod.productCode
                                ? `${prod.productCode} — ${prod.productName} · ${formatMoney(prod.unitPrice)}`
                                : prod.search
                            }
                            onFocus={() => {
                              if (!prod.productCode) {
                                updateProduct(client.id, prod.id, { showList: true });
                              }
                            }}
                            onChange={(e) => {
                              if (prod.productCode) clearProduct(client.id, prod.id);
                              updateProduct(client.id, prod.id, {
                                search: e.target.value,
                                showList: true,
                                productCode: "",
                                productName: "",
                                unitPrice: 0,
                              });
                            }}
                            placeholder="ჩაწერე კოდი ან დასახელება, ან აირჩიე სიიდან..."
                            autoComplete="off"
                          />
                          {prod.productCode && (
                            <button
                              type="button"
                              className="absolute right-2 top-2 text-xs text-zinc-400 hover:text-white"
                              onClick={() => clearProduct(client.id, prod.id)}
                            >
                              შეცვლა
                            </button>
                          )}
                          {!prod.productCode && prod.showList && (
                            <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                              {suggestions.map((p) => (
                                <li key={p.code}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => pickProduct(client.id, prod.id, p)}
                                  >
                                    <span className="text-emerald-400">{p.code}</span>
                                    <span className="mx-1 text-zinc-500">—</span>
                                    {p.name}
                                    <span className="float-right text-zinc-400">{formatMoney(p.price)}</span>
                                  </button>
                                </li>
                              ))}
                              {suggestions.length === 0 && (
                                <li className="px-3 py-2 text-xs text-zinc-500">ვერ მოიძებნა</li>
                              )}
                            </ul>
                          )}
                        </div>

                        {!prod.productCode && products.length > 0 && (
                          <div className="mt-2">
                            <label className="mb-1 block text-xs text-zinc-400">სწრაფი არჩევა სიიდან</label>
                            <select
                              className={inputCls}
                              value=""
                              onChange={(e) => {
                                const p = products.find((x) => x.code === e.target.value);
                                if (p) pickProduct(client.id, prod.id, p);
                              }}
                            >
                              <option value="">აირჩიეთ პროდუქტი...</option>
                              {products.slice(0, 200).map((p) => (
                                <option key={p.code} value={p.code}>
                                  {p.code} — {p.name} ({p.price})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs text-zinc-400">რაოდენობა</label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className={inputCls}
                              value={prod.quantity}
                              onChange={(e) => updateProduct(client.id, prod.id, { quantity: e.target.value })}
                            />
                          </div>
                          {prod.productCode && (
                            <div>
                              <label className="mb-1 block text-xs text-zinc-400">
                                გასაყიდი ფასი (კალკულატორი, შეგიძლიათ შეცვლა)
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                className={inputCls}
                                value={prod.unitPrice || ""}
                                onChange={(e) =>
                                  updateProduct(client.id, prod.id, {
                                    unitPrice: parseFloat(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                        {prod.productCode && (
                          <p className="mt-1 text-right text-xs text-emerald-400">
                            ჯამი: {formatMoney((parseFloat(prod.quantity) || 0) * prod.unitPrice)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-right text-sm font-medium text-emerald-400">
            სულ გაყიდვები: {formatMoney(salesTotal)}
          </p>
        </section>

        <section className="rounded-xl border border-red-900/40 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-red-400">ხარჯები (არასავალდებულო)</h2>
            <button type="button" className={smallBtn} onClick={() => setExpenses((s) => [...s, emptyExpense()])}>
              + დამატება
            </button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-xs text-zinc-500">ხარჯი არ არის დამატებული</p>
          ) : (
            <div className="space-y-3">
              {expenses.map((row, i) => (
                <div key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="mb-2 flex justify-between text-xs text-zinc-500">
                    <span>#{i + 1}</span>
                    <button
                      type="button"
                      className="text-red-400"
                      onClick={() => setExpenses((s) => s.filter((x) => x.id !== row.id))}
                    >
                      წაშლა
                    </button>
                  </div>
                  <select
                    className={`${inputCls} mb-2`}
                    value={row.category}
                    onChange={(e) =>
                      setExpenses((s) =>
                        s.map((x) =>
                          x.id === row.id ? { ...x, category: e.target.value as ExpenseCategory } : x
                        )
                      )
                    }
                  >
                    {BRANCH_EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={inputCls}
                      value={row.amount}
                      onChange={(e) =>
                        setExpenses((s) =>
                          s.map((x) => (x.id === row.id ? { ...x, amount: e.target.value } : x))
                        )
                      }
                      placeholder="თანხა"
                    />
                    <select
                      className={inputCls}
                      value={row.paymentMethod}
                      onChange={(e) =>
                        setExpenses((s) =>
                          s.map((x) =>
                            x.id === row.id
                              ? { ...x, paymentMethod: e.target.value as ExpensePaymentMethod }
                              : x
                          )
                        )
                      }
                    >
                      {EXPENSE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className={inputCls}
                    value={row.comment}
                    onChange={(e) =>
                      setExpenses((s) =>
                        s.map((x) => (x.id === row.id ? { ...x, comment: e.target.value } : x))
                      )
                    }
                    placeholder="კომენტარი"
                  />
                </div>
              ))}
            </div>
          )}
          {expensesTotal > 0 && (
            <p className="mt-3 text-right text-sm font-medium text-red-400">
              სულ ხარჯი: {formatMoney(expensesTotal)}
            </p>
          )}
        </section>

        <button type="submit" className={btnCls} disabled={submitting || employees.length === 0}>
          {submitting ? "იგზავნება..." : "რეპორტის გაგზავნა"}
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-zinc-600 py-3 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
          disabled={submitting || employees.length === 0 || !selectedEmployeeId}
          onClick={(e) => submit(e, true)}
        >
          ნულოვანი რეპორტი (გაყიდვა არ ყოფილა)
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        ნეტო:{" "}
        <span className={salesTotal - expensesTotal >= 0 ? "text-emerald-400" : "text-red-400"}>
          {formatMoney(salesTotal - expensesTotal)}
        </span>
      </p>
    </div>
  );
}
