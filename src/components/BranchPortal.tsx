"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CustomerPersonType,
  Employee,
  ExpenseCategory,
  ExpensePaymentMethod,
  PaymentMethod,
  Product,
} from "@/lib/types";
import { BRANCH_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "@/lib/dashboard-data";
import { formatMoney, uid } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base focus:border-emerald-500 focus:outline-none";
const btnCls =
  "w-full rounded-xl bg-emerald-600 py-4 text-base font-semibold hover:bg-emerald-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800";

type CartItem = {
  id: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type CompletedSale = {
  id: string;
  personType: CustomerPersonType;
  firstName: string;
  lastName: string;
  phone: string;
  personalId?: string;
  companyName?: string;
  companyId?: string;
  contactPhone?: string;
  driverEmployeeId?: string;
  driverEmployeeName?: string;
  paymentMethod: PaymentMethod;
  comment?: string;
  items: CartItem[];
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
};

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string; icon: string }[] = [
  { value: "ქეში (ნაღდი)", label: "ნაღდი", hint: "მაღაზიის ბალანსი", icon: "💵" },
  { value: "ბარათი", label: "ბარათი", hint: "კომპანიის ანგარიში", icon: "💳" },
  { value: "ანგარიშზე ჩარიცხვა", label: "გადარიცხვა", hint: "კომპანიის ანგარიში", icon: "🏦" },
];

function emptyExpense(): ExpenseRow {
  return { id: uid(), category: "სხვა", amount: "", paymentMethod: "ქეში (ნაღდი)", comment: "" };
}

function matchProducts(products: Product[], query: string, limit?: number): Product[] {
  const q = query.trim().toLowerCase();
  const cap = limit ?? (q ? 30 : products.length);
  if (!q) return products.slice(0, cap);
  const byCode = products.filter((p) => p.code.toLowerCase().includes(q));
  const byName = products.filter(
    (p) => p.name.toLowerCase().includes(q) && !byCode.some((x) => x.code === p.code)
  );
  return [...byCode, ...byName].slice(0, cap);
}

function cartTotal(items: CartItem[]) {
  return items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [showExpenses, setShowExpenses] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [personType, setPersonType] = useState<CustomerPersonType>("physical");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [driverEmployeeId, setDriverEmployeeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ქეში (ნაღდი)");

  const [productSearch, setProductSearch] = useState("");
  const [showProductList, setShowProductList] = useState(false);
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState("1");
  const [addPrice, setAddPrice] = useState("");

  useEffect(() => {
    fetch(`/api/branch?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((branchData) => {
        if (branchData.error) setErr(branchData.error);
        else {
          setBranch(branchData.branch);
          const list: Employee[] = branchData.employees ?? [];
          setEmployees(list);
          if (list.length === 1) setSelectedEmployeeId(list[0].id);
          setProducts((branchData.products ?? []) as Product[]);
          if (branchData.productsWarning) setProductWarning(String(branchData.productsWarning));
          else if (!branchData.products?.length) {
            setProductWarning("პროდუქტების სია ცარიელია");
          }
        }
      })
      .catch(() => setErr("კავშირის შეცდომა"))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const driverEmployee = employees.find((e) => e.id === (driverEmployeeId || selectedEmployeeId));

  useEffect(() => {
    if (selectedEmployeeId && !driverEmployeeId) setDriverEmployeeId(selectedEmployeeId);
  }, [selectedEmployeeId, driverEmployeeId]);
  const cartSum = useMemo(() => cartTotal(cart), [cart]);
  const daySalesTotal = useMemo(
    () => completedSales.reduce((s, sale) => s + cartTotal(sale.items), 0),
    [completedSales]
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [expenses]
  );
  const suggestions = matchProducts(products, pickedProduct ? "" : productSearch);

  function pickProductForCart(p: Product) {
    setPickedProduct(p);
    setProductSearch(`${p.code} — ${p.name}`);
    setAddPrice(String(p.price));
    setAddQty("1");
    setShowProductList(false);
  }

  function clearPickedProduct() {
    setPickedProduct(null);
    setProductSearch("");
    setAddPrice("");
    setAddQty("1");
  }

  function addToCart() {
    if (!pickedProduct) return;
    const qty = parseFloat(addQty) || 0;
    const price = parseFloat(addPrice) || 0;
    if (qty <= 0 || price < 0) {
      setErr("შეიყვანეთ რაოდენობა და ფასი");
      return;
    }
    setErr("");
    setCart((items) => {
      const existing = items.find((i) => i.productCode === pickedProduct.code && i.unitPrice === price);
      if (existing) {
        return items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [
        ...items,
        {
          id: uid(),
          productCode: pickedProduct.code,
          productName: pickedProduct.name,
          unitPrice: price,
          quantity: qty,
        },
      ];
    });
    clearPickedProduct();
  }

  function removeFromCart(id: string) {
    setCart((items) => items.filter((i) => i.id !== id));
  }

  function updateCartQty(id: string, qty: string) {
    const n = parseFloat(qty) || 0;
    if (n <= 0) {
      removeFromCart(id);
      return;
    }
    setCart((items) => items.map((i) => (i.id === id ? { ...i, quantity: n } : i)));
  }

  function finishSale() {
    if (personType === "physical") {
      if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
        setErr("შეავსეთ სახელი, გვარი და ტელეფონი");
        return;
      }
    } else {
      if (!companyName.trim() || !companyId.trim()) {
        setErr("შეავსეთ კომპანიის დასახელება და საიდენტიფიკაციო კოდი");
        return;
      }
    }
    if (cart.length === 0) {
      setErr("კალათა ცარიელია — დაამატეთ მინიმუმ ერთი პროდუქტი");
      return;
    }
    setErr("");
    setCompletedSales((sales) => [
      ...sales,
      {
        id: uid(),
        personType,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        personalId: personalId.trim() || undefined,
        companyName: companyName.trim() || undefined,
        companyId: companyId.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        driverEmployeeId: driverEmployeeId || selectedEmployeeId,
        driverEmployeeName: driverEmployee?.name,
        paymentMethod,
        comment: customerComment.trim() || undefined,
        items: cart.map((i) => ({ ...i })),
      },
    ]);
    setCart([]);
    setFirstName("");
    setLastName("");
    setPhone("");
    setPersonalId("");
    setCompanyName("");
    setCompanyId("");
    setContactPhone("");
    setCustomerComment("");
    setPaymentMethod("ქეში (ნაღდი)");
  }

  function removeCompletedSale(id: string) {
    setCompletedSales((sales) => sales.filter((s) => s.id !== id));
  }

  async function submit(e: React.FormEvent, asZero = false) {
    e.preventDefault();
    if (submitting) return;

    if (!selectedEmployeeId) {
      setErr("აირჩიეთ თენი სახელი");
      return;
    }
    if (employees.length === 0) {
      setErr("თანამშრომელი ჯერ არ არის დამატებული");
      return;
    }

    if (!asZero && cart.length > 0) {
      setErr("კალათაში დარჩა პროდუქტი — დაასრულეთ გაყიდვა ან წაშალეთ");
      return;
    }

    const allSales = asZero ? [] : [...completedSales];
    const validClients = allSales.map((c) => ({
      personType: c.personType,
      customerFirstName: c.personType === "legal" ? "" : c.firstName,
      customerLastName: c.personType === "legal" ? "" : c.lastName,
      personalId: c.personalId,
      phone: c.personType === "legal" ? c.contactPhone || "" : c.phone,
      companyName: c.companyName,
      companyId: c.companyId,
      contactPhone: c.contactPhone,
      comment: c.comment,
      driverEmployeeId: c.driverEmployeeId,
      driverEmployeeName: c.driverEmployeeName,
      paymentMethod: c.paymentMethod,
      products: c.items.map((p) => ({
        productCode: p.productCode,
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        amount: p.quantity * p.unitPrice,
        paymentMethod: c.paymentMethod,
      })),
    }));

    const validExpenses = expenses
      .filter((r) => parseFloat(r.amount) > 0)
      .map((r) => ({
        category: r.category,
        amount: parseFloat(r.amount),
        paymentMethod: r.paymentMethod,
        comment: r.comment.trim() || r.category,
      }));

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
      setCompletedSales([]);
      setCart([]);
      setExpenses([]);
      setFirstName("");
      setLastName("");
      setPhone("");
      clearPickedProduct();
    } catch {
      setErr("კავშირის შეცდომა");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        იტვირთება...
      </div>
    );
  }
  if (err && !branch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">{err}</div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-6 text-zinc-100">
      <h1 className="text-2xl font-bold">{branch}</h1>
      <p className="mb-5 text-sm text-zinc-500">დღის რეპორტი</p>

      {ok && (
        <div className="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          ✓ გაგზავნილია! სამუშაო დღე დაფიქსირდა.
        </div>
      )}
      {err && branch && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      <form onSubmit={(e) => submit(e, false)} className="space-y-5">
        {/* 1. Employee + date */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">1. ვინ ხარ?</p>
          {employees.length === 0 ? (
            <p className="text-sm text-amber-300">თანამშრომელი არ არის — დაამატეთ ადმინ პანელიდან.</p>
          ) : (
            <>
              <select
                className={inputCls}
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                required
              >
                <option value="">აირჩიეთ სახელი...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
              {selectedEmployee && (
                <p className="mt-2 text-xs text-teal-400">
                  დღიური ხელფასი: {formatMoney(selectedEmployee.dailyWage)}
                </p>
              )}
            </>
          )}
          <div className="mt-3">
            <label className="mb-1 block text-xs text-zinc-500">თარიღი</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </section>

        {/* 2. Customer */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">2. კლიენტი</p>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-2 text-sm ${personType === "physical" ? "border-emerald-500 bg-emerald-950/40 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
              onClick={() => setPersonType("physical")}
            >
              ფიზიკური პირი
            </button>
            <button
              type="button"
              className={`rounded-xl border px-3 py-2 text-sm ${personType === "legal" ? "border-emerald-500 bg-emerald-950/40 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
              onClick={() => setPersonType("legal")}
            >
              იურიდიული პირი
            </button>
          </div>

          {personType === "physical" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="სახელი" />
                <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="გვარი" />
              </div>
              <input
                className={`${inputCls} mt-2`}
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                placeholder="პირადი ნომერი"
                inputMode="numeric"
              />
              <input
                className={`${inputCls} mt-2`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ტელეფონი (5xxxxxxxx)"
                inputMode="tel"
              />
            </>
          ) : (
            <>
              <input
                className={inputCls}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="კომპანიის დასახელება"
              />
              <input
                className={`${inputCls} mt-2`}
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                placeholder="საიდენტიფიკაციო კოდი"
                inputMode="numeric"
              />
              <input
                className={`${inputCls} mt-2`}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="ტელეფონი"
                inputMode="tel"
              />
            </>
          )}

          <textarea
            className={`${inputCls} mt-3 min-h-[4rem] resize-y text-sm`}
            value={customerComment}
            onChange={(e) => setCustomerComment(e.target.value)}
            placeholder="კომენტარი (არასავალდებულო)"
            rows={2}
          />

          <div className="mt-3">
            <label className="mb-1 block text-xs text-zinc-500">მომზიდავი თანამშრომელი</label>
            <select
              className={inputCls}
              value={driverEmployeeId || selectedEmployeeId}
              onChange={(e) => setDriverEmployeeId(e.target.value)}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <p className="mb-2 mt-4 text-xs text-zinc-500">გადახდის ტიპი</p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentMethod(opt.value)}
                className={`rounded-xl border px-2 py-3 text-center transition ${
                  paymentMethod === opt.value
                    ? "border-emerald-500 bg-emerald-950/50 text-emerald-300"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <p className="mt-1 text-xs font-medium">{opt.label}</p>
                <p className="text-[10px] text-zinc-500">{opt.hint}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 3. Cart */}
        <section className="rounded-2xl border border-emerald-900/40 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-emerald-500/80">
            3. პროდუქტები → კალათა
          </p>
          {productWarning && <p className="mb-2 text-xs text-amber-300">{productWarning}</p>}
          {products.length > 0 && (
            <p className="mb-2 text-xs text-zinc-500">{products.length} პროდუქტი ხელმისაწვდომია</p>
          )}

          <div className="relative">
            <input
              className={inputCls}
              value={productSearch}
              onFocus={() => !pickedProduct && setShowProductList(true)}
              onChange={(e) => {
                if (pickedProduct) clearPickedProduct();
                setProductSearch(e.target.value);
                setShowProductList(true);
              }}
              placeholder="ჩაწერე კოდი ან სახელი..."
              autoComplete="off"
            />
            {!pickedProduct && showProductList && (
              <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                {suggestions.map((p) => (
                  <li key={p.code}>
                    <button
                      type="button"
                      className="w-full px-3 py-3 text-left text-sm hover:bg-zinc-800"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickProductForCart(p)}
                    >
                      <span className="font-medium text-emerald-400">{p.code}</span>
                      <span className="mx-1 text-zinc-600">|</span>
                      <span>{p.name}</span>
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

          {pickedProduct && (
            <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
              <p className="mb-2 text-sm font-medium text-emerald-400">
                {pickedProduct.code} — {pickedProduct.name}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">რაოდენობა</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputCls}
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">ფასი (₾)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inputCls}
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className={smallBtn} onClick={clearPickedProduct}>
                  გაუქმება
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600"
                  onClick={addToCart}
                >
                  + კალათაში
                </button>
              </div>
            </div>
          )}

          {cart.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-zinc-400">🛒 კალათა</p>
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.productName}</p>
                    <p className="text-xs text-zinc-500">
                      {item.productCode} · {formatMoney(item.unitPrice)}/ც
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    className="w-14 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-center text-sm"
                    value={item.quantity}
                    onChange={(e) => updateCartQty(item.id, e.target.value)}
                  />
                  <span className="w-16 text-right text-sm text-emerald-400">
                    {formatMoney(item.quantity * item.unitPrice)}
                  </span>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300"
                    onClick={() => removeFromCart(item.id)}
                    aria-label="წაშლა"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <p className="text-right text-base font-semibold text-emerald-400">
                კალათის ჯამი: {formatMoney(cartSum)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-zinc-600">კალათა ცარიელია</p>
          )}

          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-emerald-700 bg-emerald-950/30 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-40"
            onClick={finishSale}
            disabled={cart.length === 0}
          >
            ✓ გაყიდვის დასრულება (კალათა → სია)
          </button>
        </section>

        {/* Completed sales today */}
        {completedSales.length > 0 && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              დღის გაყიდვები ({completedSales.length})
            </p>
            <div className="space-y-3">
              {completedSales.map((sale, i) => {
                const total = cartTotal(sale.items);
                const payLabel = PAYMENT_OPTIONS.find((p) => p.value === sale.paymentMethod)?.label ?? sale.paymentMethod;
                return (
                  <div key={sale.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="mb-1 flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {i + 1}.{" "}
                          {sale.personType === "legal"
                            ? sale.companyName
                            : `${sale.firstName} ${sale.lastName}`}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {sale.personType === "legal"
                            ? `ს/კ: ${sale.companyId}${sale.contactPhone ? ` · ${sale.contactPhone}` : ""}`
                            : `${sale.phone}${sale.personalId ? ` · პ/n: ${sale.personalId}` : ""}`}{" "}
                          · {payLabel}
                          {sale.driverEmployeeName ? ` · მომზიდავი: ${sale.driverEmployeeName}` : ""}
                          {sale.comment ? ` · ${sale.comment}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-400">{formatMoney(total)}</p>
                        <button
                          type="button"
                          className="text-xs text-red-400"
                          onClick={() => removeCompletedSale(sale.id)}
                        >
                          წაშლა
                        </button>
                      </div>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
                      {sale.items.map((item) => (
                        <li key={item.id}>
                          {item.productName} ×{item.quantity} = {formatMoney(item.quantity * item.unitPrice)}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-right font-semibold text-emerald-400">
              სულ: {formatMoney(daySalesTotal)}
            </p>
          </section>
        )}

        {/* Expenses - collapsed */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowExpenses((v) => !v)}
          >
            <span className="text-sm text-zinc-400">ხარჯები (არასავალდებულო)</span>
            <span className="text-zinc-500">{showExpenses ? "▲" : "▼"}</span>
          </button>
          {showExpenses && (
            <div className="mt-3 space-y-3">
              {expenses.length === 0 && (
                <p className="text-xs text-zinc-600">ხარჯი არ არის</p>
              )}
              {expenses.map((row, i) => (
                <div key={row.id} className="rounded-xl border border-zinc-800 p-3">
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
                  <div className="grid grid-cols-2 gap-2">
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
                      placeholder="თანხა (₾)"
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
                    className={`${inputCls} mt-2`}
                    value={row.comment}
                    onChange={(e) =>
                      setExpenses((s) =>
                        s.map((x) => (x.id === row.id ? { ...x, comment: e.target.value } : x))
                      )
                    }
                    placeholder="რაში დაიხარჯა? (მაგ: საწვავი, ყავა, საკანცელარიო...)"
                  />
                </div>
              ))}
              <button
                type="button"
                className={smallBtn}
                onClick={() => setExpenses((s) => [...s, emptyExpense()])}
              >
                + ხარჯი
              </button>
              {expensesTotal > 0 && (
                <p className="text-right text-sm text-red-400">სულ ხარჯი: {formatMoney(expensesTotal)}</p>
              )}
            </div>
          )}
        </section>

        {/* Submit */}
        <button type="submit" className={btnCls} disabled={submitting || employees.length === 0}>
          {submitting ? "იგზავნება..." : "📤 დღის რეპორტის გაგზავნა"}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-zinc-600 py-3 text-sm text-zinc-400 hover:bg-zinc-900 disabled:opacity-40"
          disabled={submitting || employees.length === 0 || !selectedEmployeeId}
          onClick={(e) => submit(e, true)}
        >
          გაყიდვა არ ყოფილა (ნულოვანი რეპორტი + ხელფასის ხარჯი)
        </button>
      </form>

      {(daySalesTotal > 0 || expensesTotal > 0) && (
        <p className="mt-4 text-center text-sm text-zinc-500">
          ნეტო:{" "}
          <span className={daySalesTotal - expensesTotal >= 0 ? "text-emerald-400" : "text-red-400"}>
            {formatMoney(daySalesTotal - expensesTotal)}
          </span>
        </p>
      )}
    </div>
  );
}
