"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttendanceRecord,
  Branch,
  BranchCash,
  BranchDailyReport,
  Employee,
  Expense,
  ExpenseBranch,
  ExpenseCategory,
  Obligation,
  PaymentMethod,
  PaymentStatus,
  PeriodReport,
  Product,
  Sale,
  Store,
  Transaction,
} from "@/lib/types";
import {
  BRANCHES,
  CATEGORIES,
  EXPENSE_BRANCHES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/dashboard-data";
import {
  calcBalances,
  clearLegacyTransactions,
  currentMonth,
  emptyBranchCash,
  formatDate,
  formatMoney,
  getStock,
  loadLegacyTransactions,
  paymentsForObligation,
  paymentsForSale,
  deliveriesForSale,
  obligationSummary,
  saleCreditPaid,
  saleCreditRemaining,
  saleQuantityDelivered,
  saleQuantityRemaining,
  isCreditOrder,
  isCreditOrderFullyComplete,
  isCreditOrderActive,
  uid,
} from "@/lib/utils";
import { PinModal, usePin } from "@/components/PinModal";
import { clearSessionPin, getSessionPin, setSessionPin } from "@/lib/pin-session";
import { mergeStore, isStorePayload } from "@/lib/store-merge";
import { PRODUCTS_REFRESH_MS } from "@/lib/sheets-config";
import { env } from "@/lib/env";

function branchLink(token: string) {
  const base = env.appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/f/${token}`;
}

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";
const tabCls = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

function parseNum(raw: string): number {
  if (!raw.trim()) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

type Tab = "main" | "obligations" | "reports" | "branches" | "inventory" | "employees";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

async function apiTx(method: string, body?: object, qs = "") {
  const res = await fetch(`/api/transactions${qs}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "შეცდომა");
  return data;
}

async function verifyPin(pin: string) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return res.ok && data.ok;
}

export default function Dashboard() {
  const pin = usePin();
  const adminPinRef = useRef("");
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("main");
  const [store, setStore] = useState<Store | null>(null);
  const [storeWarning, setStoreWarning] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSource, setProductSource] = useState("");
  const [productWarning, setProductWarning] = useState("");
  const [productsUpdatedAt, setProductsUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Branch | "ყველა">("ყველა");
  const [pinInput, setPinInput] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const skipCashAutoSave = useRef(true);
  const skipStockAutoSave = useRef(true);

  // Sale form
  const [sBranch, setSBranch] = useState<Branch>("ქუთაისი");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [payStatus, setPayStatus] = useState<PaymentStatus>("სრულად გადახდილი");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("ქეში (ნაღდი)");
  const [sComment, setSComment] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [creditAdvance, setCreditAdvance] = useState("");
  const [creditPayInputs, setCreditPayInputs] = useState<Record<string, string>>({});
  const [creditDeliverInputs, setCreditDeliverInputs] = useState<Record<string, string>>({});
  const [creditPayMethods, setCreditPayMethods] = useState<Record<string, PaymentMethod>>({});

  // Expense form
  const [eBranch, setEBranch] = useState<ExpenseBranch>("საერთო");
  const [category, setCategory] = useState<ExpenseCategory>("საწვავი");
  const [eAmount, setEAmount] = useState("");
  const [eComment, setEComment] = useState("");

  // Obligations
  const [obMonth, setObMonth] = useState(currentMonth());
  const [obName, setObName] = useState("");
  const [obAmount, setObAmount] = useState("");
  const [obBranch, setObBranch] = useState<ExpenseBranch | "ყველა">("ყველა");
  const [obCategory, setObCategory] = useState<ExpenseCategory>("ხელფასი");
  const [obRecurring, setObRecurring] = useState(true);

  // Obligation payment
  const [obPayInputs, setObPayInputs] = useState<Record<string, string>>({});
  const [obPayMethods, setObPayMethods] = useState<Record<string, PaymentMethod>>({});
  const [obPayBranches, setObPayBranches] = useState<Record<string, ExpenseBranch>>({});

  // Employee form
  const [empName, setEmpName] = useState("");
  const [empBranch, setEmpBranch] = useState<Branch>("ქუთაისი");
  const [empWage, setEmpWage] = useState("");
  const [empMonthFilter, setEmpMonthFilter] = useState(currentMonth());

  // Reports
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [repFrom, setRepFrom] = useState("");
  const [repTo, setRepTo] = useState("");
  const [repBranch, setRepBranch] = useState<Branch | "ყველა">("ყველა");

  // Inventory
  const [invBranch, setInvBranch] = useState<Branch>("ქუთაისი");
  const [invSearch, setInvSearch] = useState("");
  const [invSelected, setInvSelected] = useState<Product | null>(null);
  const [invQty, setInvQty] = useState("");
  const [cashForm, setCashForm] = useState<BranchCash>({ cash: 0, card: 0, bank: 0 });
  const [invFilter, setInvFilter] = useState<Branch | "ყველა">("ყველა");

  function getAdminPin() {
    return adminPinRef.current || getSessionPin();
  }

  function rememberPin(pinCode: string) {
    adminPinRef.current = pinCode;
    setSessionPin(pinCode);
    setUnlocked(true);
  }

  function runWithPin(action: (pinCode: string) => void | Promise<void>) {
    const saved = getAdminPin();
    if (unlocked && saved) {
      void action(saved);
      return;
    }
    pin.requestPin(action);
  }

  const saveInventory = useCallback(async (body: object, pinCode?: string) => {
    const pin = pinCode || getAdminPin();
    if (!pin) throw new Error("გახსენით ადმინი PIN კოდით");
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, pin }),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "შენახვა ვერ მოხერხდა");
    return data as { inventory?: Store["inventory"]; branchCash?: Store["branchCash"] };
  }, []);

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    const d = await res.json();
    if (d.error && !d.products?.length) setError(d.error);
    if (d.warning) setProductWarning(d.warning);
    else setProductWarning("");
    setProductSource(d.source ?? "");
    setProductsUpdatedAt(d.updatedAt ?? "");
    const list = (d.products ?? []) as Product[];
    setProducts(list);
    setSelected((prev) => {
      if (!prev) return prev;
      const fresh = list.find((p) => p.code === prev.code);
      if (fresh) {
        setPrice(fresh.price);
        setSearch(`${fresh.code} — ${fresh.name}`);
        return fresh;
      }
      return prev;
    });
    return list;
  }, []);

  const loadStore = useCallback(async () => {
    try {
      const res = await fetch("/api/store", { cache: "no-store" });
      const raw = await res.json();
      const warning = typeof raw._loadWarning === "string" ? raw._loadWarning : "";
      const { _loadWarning: _, ...payload } = raw;
      if (!res.ok && !isStorePayload(payload)) {
        throw new Error(raw.error || "მონაცემების ჩატვირთვა ვერ მოხერხდა");
      }
      const data = mergeStore(isStorePayload(payload) ? payload : {});
      setStore(data);
      setStoreWarning(warning);
      return data;
    } catch (e) {
      const fallback = mergeStore({});
      setStore(fallback);
      setStoreWarning(e instanceof Error ? e.message : "მონაცემების ჩატვირთვა ვერ მოხერხდა");
      return fallback;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const legacy = loadLegacyTransactions();
      if (legacy.length) {
        await apiTx("POST", { migrate: legacy });
        clearLegacyTransactions();
      }
      await loadStore();
      await loadProducts().catch(() => setError("პროდუქტების ჩატვირთვა ვერ მოხერხდა"));
      const savedPin = getSessionPin();
      if (savedPin && (await verifyPin(savedPin))) rememberPin(savedPin);
      else clearSessionPin();
      setLoading(false);
    })();
  }, [loadStore, loadProducts]);

  useEffect(() => {
    const id = setInterval(() => {
      loadProducts().catch(() => {});
    }, PRODUCTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadProducts]);

  useEffect(() => {
    if (tab !== "inventory" && tab !== "branches") return;
    const id = setInterval(() => {
      loadStore().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [tab, loadStore]);

  const activeStore = store ?? mergeStore({});
  const tx = activeStore.transactions;

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  const balances = useMemo(
    () => calcBalances(tx, filter, activeStore.branchCash),
    [tx, filter, activeStore.branchCash]
  );
  const creditTx = useMemo(
    () => tx.filter((t): t is Sale => t.type === "sale" && isCreditOrder(t)),
    [tx]
  );
  const openCreditOrders = useMemo(() => creditTx.filter((t) => isCreditOrderActive(t)), [creditTx]);
  const creditRemainingTotal = useMemo(() => openCreditOrders.reduce((s, t) => s + saleCreditRemaining(t), 0), [openCreditOrders]);
  const creditQtyRemainingTotal = useMemo(() => openCreditOrders.reduce((s, t) => s + saleQuantityRemaining(t), 0), [openCreditOrders]);
  const saleById = useMemo(() => {
    const m = new Map<string, Sale>();
    for (const t of tx) if (t.type === "sale") m.set(t.id, t);
    return m;
  }, [tx]);
  const creditHistory = useMemo(() => {
    type Row = {
      id: string;
      at: string;
      kind: "pay" | "deliver";
      saleId: string;
      buyer: string;
      branch: Branch;
      productName: string;
      amount?: number;
      quantity?: number;
      paymentMethod?: PaymentMethod;
    };
    const rows: Row[] = [];
    for (const p of activeStore.creditPayments ?? []) {
      const sale = saleById.get(p.saleId);
      if (!sale) continue;
      if (filter !== "ყველა" && sale.branch !== filter) continue;
      rows.push({
        id: p.id,
        at: p.paidAt,
        kind: "pay",
        saleId: p.saleId,
        buyer: sale.buyerName || sale.comment || sale.productName,
        branch: sale.branch,
        productName: sale.productName,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
      });
    }
    for (const d of activeStore.creditDeliveries ?? []) {
      const sale = saleById.get(d.saleId);
      if (!sale) continue;
      if (filter !== "ყველა" && sale.branch !== filter) continue;
      rows.push({
        id: d.id,
        at: d.deliveredAt,
        kind: "deliver",
        saleId: d.saleId,
        buyer: sale.buyerName || sale.comment || sale.productName,
        branch: sale.branch,
        productName: sale.productName,
        quantity: d.quantity,
      });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [activeStore.creditPayments, activeStore.creditDeliveries, saleById, filter]);
  const history = useMemo(() => {
    const list = filter === "ყველა" ? tx : tx.filter((t) => t.branch === filter || t.branch === "საერთო");
    return [...list]
      .filter((t) => !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [tx, filter]);

  const obSummary = useMemo(
    () => obligationSummary(activeStore.obligations, obMonth, filter),
    [activeStore.obligations, obMonth, filter]
  );

  const recurringList = activeStore.recurringObligations;

  useEffect(() => {
    if (unlocked && tab === "obligations") refresh();
  }, [obMonth, unlocked, tab]);

  const branchReports = activeStore.branchReports;
  const inventory = activeStore.inventory;

  const inventoryRows = useMemo(() => {
    const codes = new Set<string>();
    for (const b of BRANCHES) {
      for (const code of Object.keys(inventory[b] ?? {})) codes.add(code);
    }
    for (const p of products) codes.add(p.code);
    const rows = [...codes].map((code) => {
      const product = products.find((p) => p.code === code);
      const perBranch = BRANCHES.map((b) => inventory[b]?.[code] ?? 0);
      const total = perBranch.reduce((s, n) => s + n, 0);
      return { code, name: product?.name ?? code, perBranch, total };
    });
    return rows
      .filter((r) => invFilter === "ყველა" || r.perBranch[BRANCHES.indexOf(invFilter)] > 0 || r.total > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [inventory, products, invFilter]);

  const filteredInvProducts = useMemo(() => {
    const q = invSearch.toLowerCase().trim();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, invSearch]);

  useEffect(() => {
    if (activeStore.branchCash) {
      setCashForm(activeStore.branchCash[invBranch] ?? emptyBranchCash());
      skipCashAutoSave.current = true;
    }
  }, [activeStore.branchCash, invBranch]);

  useEffect(() => {
    if (!unlocked || !getAdminPin()) return;
    if (skipCashAutoSave.current) {
      skipCashAutoSave.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSaveMsg("ინახება...");
        const data = await saveInventory({
          action: "setCash",
          branch: invBranch,
          cash: cashForm.cash,
          card: cashForm.card,
          bank: cashForm.bank,
        });
        setStore((prev) => (prev && data.branchCash ? { ...prev, branchCash: data.branchCash } : prev));
        setError("");
        setSaveMsg("შენახულია ✓");
        setTimeout(() => setSaveMsg(""), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "შენახვა ვერ მოხერხდა");
        setSaveMsg("");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [cashForm, invBranch, unlocked, saveInventory]);

  useEffect(() => {
    if (!unlocked || !getAdminPin() || !invSelected) return;
    const quantity = parseFloat(invQty);
    if (Number.isNaN(quantity) || quantity < 0) return;
    if (skipStockAutoSave.current) {
      skipStockAutoSave.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSaveMsg("მარაგი ინახება...");
        const data = await saveInventory({
          action: "setStock",
          branch: invBranch,
          productCode: invSelected.code,
          quantity,
        });
        setStore((prev) => (prev && data.inventory ? { ...prev, inventory: data.inventory } : prev));
        setError("");
        setSaveMsg("მარაგი შენახულია ✓");
        setTimeout(() => setSaveMsg(""), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "მარაგის შენახვა ვერ მოხერხდა");
        setSaveMsg("");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [invQty, invBranch, invSelected, unlocked, saveInventory]);

  function setStock(e: React.FormEvent) {
    e.preventDefault();
    if (!invSelected) return;
    const quantity = parseFloat(invQty);
    if (Number.isNaN(quantity) || quantity < 0) return;
    runWithPin(async (pinCode) => {
      try {
        const data = await saveInventory({
          action: "setStock",
          branch: invBranch,
          productCode: invSelected.code,
          quantity,
        }, pinCode);
        setStore((prev) => (prev && data.inventory ? { ...prev, inventory: data.inventory } : prev));
        setError("");
        setSaveMsg("მარაგი შენახულია ✓");
        setInvSearch("");
        setInvSelected(null);
        setInvQty("");
        skipStockAutoSave.current = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  function saveBranchCash(e: React.FormEvent) {
    e.preventDefault();
    runWithPin(async (pinCode) => {
      try {
        const data = await saveInventory({
          action: "setCash",
          branch: invBranch,
          cash: cashForm.cash,
          card: cashForm.card,
          bank: cashForm.bank,
        }, pinCode);
        setStore((prev) => (prev && data.branchCash ? { ...prev, branchCash: data.branchCash } : prev));
        setError("");
        setSaveMsg("შენახულია ✓");
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  function pickInvProduct(p: Product) {
    setInvSelected(p);
    setInvSearch(`${p.code} — ${p.name}`);
    const cur = getStock(inventory, invBranch, p.code);
    setInvQty(String(cur));
    skipStockAutoSave.current = true;
  }

  function pickProduct(p: Product) {
    setSelected(p);
    setSearch(`${p.code} — ${p.name}`);
    setPrice(p.price);
    setQty(1);
  }

  const selectedStock = selected ? getStock(inventory, sBranch, selected.code) : 0;

  async function refresh() {
    const data = await loadStore();
    return data;
  }

  async function addSale(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || qty <= 0 || price <= 0) return;
    const total = qty * price;
    const advance = payStatus === "ბე (ავანსი)" ? parseFloat(creditAdvance) || 0 : 0;
    const sale: Sale = {
      id: uid(),
      type: "sale",
      date: new Date().toISOString(),
      branch: sBranch,
      productCode: selected.code,
      productName: selected.name,
      quantity: qty,
      unitPrice: price,
      amount: total,
      paymentStatus: payStatus,
      paymentMethod: payMethod,
      comment: sComment.trim() || `${selected.name} × ${qty}`,
      source: "admin",
      buyerName: payStatus === "ბე (ავანსი)" ? buyerName.trim() || undefined : undefined,
      creditPaid: payStatus === "ბე (ავანსი)" ? advance : undefined,
    };
    try {
      const data = await apiTx("POST", { transaction: sale });
      setStore((prev) =>
        prev
          ? {
              ...prev,
              transactions: data.transactions ?? [sale, ...prev.transactions],
              inventory: data.inventory ?? prev.inventory,
              creditPayments: data.creditPayments ?? prev.creditPayments,
              creditDeliveries: data.creditDeliveries ?? prev.creditDeliveries,
            }
          : prev
      );
      setSaveMsg("გაყიდვა შენახულია ✓");
      setSearch("");
      setSelected(null);
      setQty(1);
      setPrice(0);
      setSComment("");
      setBuyerName("");
      setCreditAdvance("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "გაყიდვა ვერ შეინახა");
    }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(eAmount);
    if (!amount || amount <= 0) return;
    const expense: Expense = {
      id: uid(),
      type: "expense",
      date: new Date().toISOString(),
      branch: eBranch,
      category,
      amount,
      comment: eComment.trim() || category,
      source: "admin",
    };
    try {
      const data = await apiTx("POST", { transaction: expense });
      setStore((prev) =>
        prev
          ? {
              ...prev,
              transactions: data.transactions ?? [expense, ...prev.transactions],
              obligations: data.obligations ?? prev.obligations,
            }
          : prev
      );
      setSaveMsg("ხარჯი შენახულია ✓");
      setEAmount("");
      setEComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ხარჯი ვერ შეინახა");
    }
  }

  function addCreditPayment(saleId: string) {
    const amount = parseFloat(creditPayInputs[saleId] ?? "");
    if (!amount || amount <= 0) return;
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch("/api/credit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: pinCode,
            action: "pay",
            saleId,
            amount,
            paymentMethod: creditPayMethods[saleId] ?? "ქეში (ნაღდი)",
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        setStore((prev) =>
          prev
            ? {
                ...prev,
                transactions: d.transactions ?? prev.transactions,
                creditPayments: d.creditPayments ?? prev.creditPayments,
                creditDeliveries: d.creditDeliveries ?? prev.creditDeliveries,
                inventory: d.inventory ?? prev.inventory,
              }
            : prev
        );
        setCreditPayInputs((m) => ({ ...m, [saleId]: "" }));
        setSaveMsg(d.sale?.orderCompletedAt ? "შეკვეთა სრულად დასრულდა ✓" : "გადახდა დაფიქსირდა ✓");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  function addCreditDelivery(saleId: string) {
    const quantity = parseFloat(creditDeliverInputs[saleId] ?? "");
    if (!quantity || quantity <= 0) return;
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch("/api/credit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pinCode, action: "deliver", saleId, quantity }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        setStore((prev) =>
          prev
            ? {
                ...prev,
                transactions: d.transactions ?? prev.transactions,
                creditPayments: d.creditPayments ?? prev.creditPayments,
                creditDeliveries: d.creditDeliveries ?? prev.creditDeliveries,
                inventory: d.inventory ?? prev.inventory,
              }
            : prev
        );
        setCreditDeliverInputs((m) => ({ ...m, [saleId]: "" }));
        setSaveMsg(d.sale?.orderCompletedAt ? "შეკვეთა სრულად დასრულდა ✓" : "მიწოდება დაფიქსირდა ✓");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  function deleteTx(id: string) {
    runWithPin(async (pinCode) => {
      try {
        await apiTx("DELETE", undefined, `?id=${id}&pin=${encodeURIComponent(pinCode)}`);
        await refresh();
        setSaveMsg("წაშლილია");
      } catch (e) {
        setError(e instanceof Error ? e.message : "წაშლა ვერ მოხერხდა");
      }
    });
  }

  function deleteReport(reportId: string) {
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch(`/api/branch?reportId=${reportId}&pin=${encodeURIComponent(pinCode)}`, { method: "DELETE" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        await refresh();
        setSaveMsg("ანგარიში წაშლილია");
      } catch (e) {
        setError(e instanceof Error ? e.message : "წაშლა ვერ მოხერხდა");
      }
    });
  }

  async function addObligation(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(obAmount);
    if (!obName.trim() || !amount) return;
    try {
      const res = await fetch("/api/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligation: { name: obName.trim(), amount, branch: obBranch, category: obCategory, month: obMonth },
          recurring: obRecurring,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await refresh();
      setSaveMsg(obRecurring ? "ყოველთვიური ვალდებულება დაემატა ✓" : "ვალდებულება დაემატა ✓");
      setObName("");
      setObAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
    }
  }

  function deleteRecurring(recurringId: string) {
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch(
          `/api/obligations?recurringId=${recurringId}&pin=${encodeURIComponent(pinCode)}`,
          { method: "DELETE" }
        );
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        await refresh();
        setSaveMsg("ყოველთვიური ვალდებულება წაიშალა");
      } catch (e) {
        setError(e instanceof Error ? e.message : "წაშლა ვერ მოხერხდა");
      }
    });
  }

  function deleteObligation(id: string) {
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch(`/api/obligations?id=${id}&month=${obMonth}&pin=${encodeURIComponent(pinCode)}`, { method: "DELETE" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "წაშლა ვერ მოხერხდა");
      }
    });
  }

  function payObligation(obId: string) {
    const amount = parseFloat(obPayInputs[obId] ?? "");
    if (!amount || amount <= 0) return;
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch("/api/obligations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "pay",
            pin: pinCode,
            obligationId: obId,
            month: obMonth,
            amount,
            paymentMethod: obPayMethods[obId] ?? "ქეში (ნაღდი)",
            branch: obPayBranches[obId] ?? "საერთო",
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        setStore((prev) =>
          prev ? { ...prev, obligations: d.obligations ?? prev.obligations, obligationPayments: d.obligationPayments ?? prev.obligationPayments } : prev
        );
        setObPayInputs((m) => ({ ...m, [obId]: "" }));
        setSaveMsg("ვალდებულება გასტუმრდა ✓");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim()) return;
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addEmployee",
            pin: pinCode,
            name: empName.trim(),
            branch: empBranch,
            dailyWage: parseFloat(empWage) || 0,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        setStore((prev) => prev ? { ...prev, employees: d.employees ?? prev.employees } : prev);
        setEmpName("");
        setEmpWage("");
        setSaveMsg("თანამშრომელი დამატებულია ✓");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  function toggleEmployee(empId: string) {
    runWithPin(async (pinCode) => {
      try {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggleEmployee", pin: pinCode, employeeId: empId }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "შეცდომა");
        setStore((prev) => prev ? { ...prev, employees: d.employees ?? prev.employees } : prev);
      } catch (e) {
        setError(e instanceof Error ? e.message : "შეცდომა");
      }
    });
  }

  async function loadReport(mode: string, from?: string, to?: string) {
    const b = repBranch === "ყველა" ? "ყველა" : repBranch;
    let url = `/api/reports?mode=${mode}&branch=${encodeURIComponent(b)}`;
    if (from && to) url += `&from=${from}&to=${to}`;
    const res = await fetch(url);
    setReport(await res.json());
  }

  function txLabel(t: Transaction) {
    if (t.type === "sale") {
      const emp = t.employeeName ? ` (${t.employeeName})` : "";
      return `${t.productName} × ${t.quantity}${emp}`;
    }
    return t.category;
  }

  function txDetail(t: Transaction) {
    if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) {
      const moneyLeft = saleCreditRemaining(t);
      const qtyLeft = saleQuantityRemaining(t);
      const parts: string[] = [];
      if (moneyLeft > 0) parts.push(`გადასახდელი ${formatMoney(moneyLeft)}`);
      else parts.push("ფული ✓");
      if (qtyLeft > 0) parts.push(`დასამიწოდებელი ${qtyLeft} ც`);
      else parts.push("მოწოდება ✓");
      return `ბე · ${parts.join(" · ")}`;
    }
    if (t.type === "sale") {
      if (t.orderCompletedAt) return `ბე დასრულებული · ${t.paymentMethod}`;
      return `${t.paymentStatus} · ${t.paymentMethod}`;
    }
    return t.source === "branch" ? "ხარჯი (ფილიალი)" : "ხარჯი";
  }

  async function unlockAdmin(pinCode: string) {
    const ok = await verifyPin(pinCode);
    if (ok) {
      rememberPin(pinCode);
      setPinInput("");
      setError("");
      return true;
    }
    return false;
  }

  async function handlePinConfirm(pinCode: string) {
    const ok = await verifyPin(pinCode);
    if (!ok) return false;
    rememberPin(pinCode);
    await pin.flushPending(pinCode);
    return true;
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <PinModal open={pin.open} onConfirm={handlePinConfirm} onCancel={pin.cancel} />

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ფინანსური Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {loading
              ? "იტვირთება..."
              : `${products.length} პროდუქტი · ${productSource === "google-sheets" ? "Google Sheets" : "ლოკალური ფაილი"}${productsUpdatedAt ? ` · ${formatDate(productsUpdatedAt)}` : ""}`}
            {saveMsg && <span className="ml-2 text-emerald-400">{saveMsg}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as Branch | "ყველა")}>
            <option value="ყველა">ყველა ფილიალი</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        <button type="button" className={tabCls(tab === "main")} onClick={() => setTab("main")}>ჩაწერა</button>
        <button type="button" className={tabCls(tab === "reports")} onClick={() => setTab("reports")}>რეპორტები</button>
        <button type="button" className={tabCls(tab === "branches")} onClick={() => setTab("branches")}>ფილიალები</button>
        <button type="button" className={tabCls(tab === "obligations")} onClick={() => setTab("obligations")}>
          ვალდებულებები
        </button>
        <button type="button" className={tabCls(tab === "inventory")} onClick={() => setTab("inventory")}>
          მარაგი და ნაშთები
        </button>
        <button type="button" className={tabCls(tab === "employees")} onClick={() => setTab("employees")}>
          თანამშრომლები
        </button>
        {!unlocked && (
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="ადმინ კოდი"
              className={`${inputCls} w-28`}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlockAdmin(pinInput)}
            />
            <button type="button" className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => unlockAdmin(pinInput)}>
              გახსნა
            </button>
          </div>
        )}
      </nav>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {storeWarning && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
          მონაცემების გაფრთხილება: {storeWarning}
        </div>
      )}

      {productWarning && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
          {productWarning}
          <p className="mt-1 text-xs text-amber-400">
            Google Sheets → გაზიარება → „ინტერნეტზე ყველას“ (მნახველი) ან ფაილი → გამოქვეყნება ვებზე
          </p>
        </div>
      )}

      {tab === "main" && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="შემოსავალი" value={formatMoney(balances.revenue)} accent="text-emerald-400" />
            <Stat label="ხარჯები" value={formatMoney(balances.expenses)} accent="text-red-400" />
            <Stat label="საერთო ბალანსი" value={formatMoney(balances.total)} accent={balances.total >= 0 ? "text-emerald-400" : "text-red-400"} />
            <Stat label="ქეში" value={formatMoney(balances.cash)} />
            <Stat label="ბარათი/ანგარიში" value={formatMoney(balances.card + balances.bank)} accent="text-sky-400" />
            <Stat label="ბე" value={formatMoney(creditRemainingTotal || balances.credit)} accent="text-amber-400" />
          </section>

          {unlocked && obSummary.total > 0 && (
            <section className="mb-6 rounded-xl border border-violet-900/50 bg-violet-950/20 p-4">
              <h3 className="mb-2 text-sm font-semibold text-violet-300">თვის ვალდებულებები ({obMonth})</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>სულ: {formatMoney(obSummary.total)}</span>
                <span className="text-emerald-400">ფარული: {formatMoney(obSummary.paid)}</span>
                <span className="text-amber-400">დარჩენილი: {formatMoney(obSummary.remaining)}</span>
              </div>
            </section>
          )}

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <form onSubmit={addSale} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-4 text-lg font-semibold text-emerald-400">გაყიდვა</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ფილიალი">
                  <select className={inputCls} value={sBranch} onChange={(e) => setSBranch(e.target.value as Branch)}>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="გადახდის სტატუსი">
                  <select className={inputCls} value={payStatus} onChange={(e) => setPayStatus(e.target.value as PaymentStatus)}>
                    {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="relative sm:col-span-2">
                  <Field label="პროდუქტი">
                    <input className={inputCls} value={search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} placeholder="კოდი ან სახელი..." autoComplete="off" />
                  </Field>
                  {search && !selected && filteredProducts.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                      {filteredProducts.map((p) => (
                        <li key={p.code}>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => pickProduct(p)}>
                            <span className="text-emerald-400">{p.code}</span> — {p.name}
                            <span className="float-right text-zinc-500">{formatMoney(p.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Field label="რაოდენობა">
                  <input className={inputCls} type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} />
                  {selected && (
                    <p className={`mt-1 text-xs ${selectedStock < qty ? "text-amber-400" : "text-zinc-500"}`}>
                      მარაგი ({sBranch}): {selectedStock}
                      {selectedStock < qty && " — არასაკმარისი!"}
                    </p>
                  )}
                </Field>
                <Field label="ფასი"><input className={inputCls} type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(+e.target.value)} /></Field>
                {payStatus !== "ბე (ავანსი)" && (
                  <Field label="გადახდის მეთოდი">
                    <select className={inputCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="ჯამი"><input className={inputCls} readOnly value={formatMoney(qty * price)} /></Field>
                {payStatus === "ბე (ავანსი)" && (
                  <>
                    <Field label="მყიდველი / კომპანია">
                      <input className={inputCls} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="მაგ: კომპანიის სახელი" />
                    </Field>
                    <Field label="ავანსი / ბე (₾)">
                      <input className={inputCls} type="number" min={0} step={0.01} value={creditAdvance} onChange={(e) => setCreditAdvance(e.target.value)} placeholder="მაგ: 15975" />
                    </Field>
                    <Field label="გადახდის მეთოდი (ავანსი)">
                      <select className={inputCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </Field>
                    <div className="mb-3 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                      შეკვეთა: {qty} ც · ჯამი {formatMoney(qty * price)} · ავანსი {formatMoney(parseFloat(creditAdvance) || 0)} · გადასახდელი {formatMoney(Math.max(0, qty * price - (parseFloat(creditAdvance) || 0)))} · მიწოდება დაიწყება 0/{qty} ც-დან
                    </div>
                  </>
                )}
                <div className="sm:col-span-2"><Field label="კომენტარი"><input className={inputCls} value={sComment} onChange={(e) => setSComment(e.target.value)} /></Field></div>
              </div>
              <button type="submit" className={`${btnCls} mt-4`} disabled={!selected}>დაფიქსირება</button>
            </form>

            <form onSubmit={addExpense} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-4 text-lg font-semibold text-red-400">ხარჯი</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ფილიალი">
                  <select className={inputCls} value={eBranch} onChange={(e) => setEBranch(e.target.value as ExpenseBranch)}>
                    {EXPENSE_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="კატეგორია">
                  <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="თანხა (₾)"><input className={inputCls} type="number" min={0} step={0.01} value={eAmount} onChange={(e) => setEAmount(e.target.value)} required /></Field>
                <div className="sm:col-span-2"><Field label="კომენტარი"><input className={inputCls} value={eComment} onChange={(e) => setEComment(e.target.value)} placeholder="მაგ: ივანე ხელფასი, ელექტროენერგია..." /></Field></div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">ხარჯი ავტომატურად ემთხვევა ვალდებულებას კატეგორიით ან სახელით</p>
              <button type="submit" className={`${btnCls} mt-4 bg-red-600 hover:bg-red-500`}>დაფიქსირება</button>
            </form>
          </div>

          {openCreditOrders.length > 0 && (
            <section className="mb-6 space-y-3">
              <h3 className="text-sm font-semibold text-amber-400">
                ბე შეკვეთები — {openCreditOrders.length} აქტიური · გადასახდელი {formatMoney(creditRemainingTotal)} · დასამიწოდებელი {creditQtyRemainingTotal} ც
              </h3>
              {openCreditOrders.map((sale) => {
                const paid = saleCreditPaid(sale);
                const moneyLeft = saleCreditRemaining(sale);
                const delivered = saleQuantityDelivered(sale);
                const qtyLeft = saleQuantityRemaining(sale);
                const done = isCreditOrderFullyComplete(sale);
                const moneyDone = moneyLeft <= 0;
                const qtyDone = qtyLeft <= 0;
                const moneyPct = sale.amount ? Math.min(100, Math.round((paid / sale.amount) * 100)) : 0;
                const qtyPct = sale.quantity ? Math.min(100, Math.round((delivered / sale.quantity) * 100)) : 0;
                const payments = paymentsForSale(activeStore, sale.id);
                const deliveries = deliveriesForSale(activeStore, sale.id);
                return (
                  <div
                    key={sale.id}
                    className={`rounded-xl border p-4 ${done ? "border-emerald-700/60 bg-emerald-950/30" : "border-amber-900/50 bg-amber-950/20"}`}
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className={`font-medium ${done ? "text-emerald-300" : "text-amber-200"}`}>
                          {sale.buyerName || sale.comment}
                          {done && <span className="ml-2 text-xs text-emerald-400">✓ შეკვეთა დასრულდა</span>}
                        </p>
                        <p className="text-sm text-zinc-400">
                          {sale.branch} · {sale.productName} · {formatMoney(sale.unitPrice)}/ც
                        </p>
                      </div>
                    </div>

                    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-zinc-900/60 px-3 py-2 text-xs">
                        <p className="text-zinc-500">შეკვეთის ჯამი</p>
                        <p className="font-medium">{formatMoney(sale.amount)}</p>
                        <p className="text-zinc-500">{sale.quantity} ც × {formatMoney(sale.unitPrice)}</p>
                      </div>
                      <div className={`rounded-lg px-3 py-2 text-xs ${moneyDone ? "bg-emerald-950/40" : "bg-zinc-900/60"}`}>
                        <p className="text-zinc-500">ფული {moneyDone ? "✓" : ""}</p>
                        <p className={`font-medium ${moneyDone ? "text-emerald-400" : "text-amber-400"}`}>
                          {formatMoney(paid)} / {formatMoney(sale.amount)}
                        </p>
                        <p className={moneyDone ? "text-emerald-400/80" : "text-amber-400/80"}>
                          {moneyDone ? "სრულად ჩარიცხული" : `დარჩენილი ${formatMoney(moneyLeft)}`}
                        </p>
                      </div>
                      <div className={`rounded-lg px-3 py-2 text-xs ${qtyDone ? "bg-emerald-950/40" : "bg-zinc-900/60"}`}>
                        <p className="text-zinc-500">მოწოდება {qtyDone ? "✓" : ""}</p>
                        <p className={`font-medium ${qtyDone ? "text-emerald-400" : "text-sky-400"}`}>
                          {delivered} / {sale.quantity} ც
                        </p>
                        <p className={qtyDone ? "text-emerald-400/80" : "text-sky-400/80"}>
                          {qtyDone ? "სრულად მიწოდებული" : `დარჩენილი ${qtyLeft} ც`}
                        </p>
                      </div>
                      <div className="rounded-lg bg-zinc-900/60 px-3 py-2 text-xs">
                        <p className="text-zinc-500">სტატუსი</p>
                        <p className={done ? "font-medium text-emerald-400" : "font-medium text-amber-300"}>
                          {done ? "დასრულებული" : moneyDone && !qtyDone ? "ფული ✓ · მოწოდება დარჩა" : qtyDone && !moneyDone ? "მოწოდება ✓ · ფული დარჩა" : "მიმდინარე"}
                        </p>
                      </div>
                    </div>

                    <div className="mb-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-zinc-500">
                          <span>ფული</span>
                          <span>{moneyPct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                          <div className={`h-full transition-all ${moneyDone ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${moneyPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-zinc-500">
                          <span>მოწოდება</span>
                          <span>{qtyPct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                          <div className={`h-full transition-all ${qtyDone ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${qtyPct}%` }} />
                        </div>
                      </div>
                    </div>

                    {(payments.length > 0 || deliveries.length > 0) && (
                      <div className="mb-3 grid gap-3 border-t border-zinc-800/80 pt-2 sm:grid-cols-2">
                        {payments.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs text-zinc-500">გადახდების ისტორია:</p>
                            {payments.map((p) => (
                              <div key={p.id} className="flex justify-between text-xs text-emerald-400/90">
                                <span>{formatDate(p.paidAt)} · {p.note || "გადახდა"}</span>
                                <span>+{formatMoney(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {deliveries.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs text-zinc-500">მიწოდების ისტორია:</p>
                            {deliveries.map((d) => (
                              <div key={d.id} className="flex justify-between text-xs text-sky-400/90">
                                <span>{formatDate(d.deliveredAt)} · {d.note || "მიწოდება"}</span>
                                <span>+{d.quantity} ც</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {unlocked && (
                      <div className="grid gap-3 border-t border-zinc-800/80 pt-3 sm:grid-cols-2">
                        <div className={`rounded-lg border p-3 ${moneyDone ? "border-emerald-900/40 bg-emerald-950/20" : "border-amber-900/40 bg-amber-950/10"}`}>
                          <p className="mb-2 text-xs font-medium text-amber-300">თანხის დამატება</p>
                          {moneyDone ? (
                            <p className="text-xs text-emerald-400">ფული სრულადაა ჩარიცხული ✓</p>
                          ) : (
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-[100px] flex-1">
                                <label className={labelCls}>თანხა (₾)</label>
                                <input
                                  className={inputCls}
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  max={moneyLeft}
                                  value={creditPayInputs[sale.id] ?? ""}
                                  onChange={(e) => setCreditPayInputs((m) => ({ ...m, [sale.id]: e.target.value }))}
                                  placeholder={`მაქს ${moneyLeft}`}
                                />
                              </div>
                              <div className="min-w-[120px] flex-1">
                                <label className={labelCls}>გადახდის მეთოდი</label>
                                <select
                                  className={inputCls}
                                  value={creditPayMethods[sale.id] ?? "ქეში (ნაღდი)"}
                                  onChange={(e) => setCreditPayMethods((m) => ({ ...m, [sale.id]: e.target.value as PaymentMethod }))}
                                >
                                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <button type="button" className={btnCls} onClick={() => addCreditPayment(sale.id)}>ჩარიცხვა</button>
                            </div>
                          )}
                        </div>
                        <div className={`rounded-lg border p-3 ${qtyDone ? "border-emerald-900/40 bg-emerald-950/20" : "border-sky-900/40 bg-sky-950/10"}`}>
                          <p className="mb-2 text-xs font-medium text-sky-300">პროდუქციის დამატება</p>
                          {qtyDone ? (
                            <p className="text-xs text-emerald-400">პროდუქტი სრულადაა მიწოდებული ✓</p>
                          ) : (
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-[120px] flex-1">
                                <label className={labelCls}>რაოდენობა (ც)</label>
                                <input
                                  className={inputCls}
                                  type="number"
                                  min={1}
                                  step={1}
                                  max={qtyLeft}
                                  value={creditDeliverInputs[sale.id] ?? ""}
                                  onChange={(e) => setCreditDeliverInputs((m) => ({ ...m, [sale.id]: e.target.value }))}
                                  placeholder={`მაქს ${qtyLeft} ც · დარჩა ${qtyLeft}`}
                                />
                              </div>
                              <button type="button" className={`${btnCls} bg-sky-600 hover:bg-sky-500`} onClick={() => addCreditDelivery(sale.id)}>დამატება</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {creditHistory.length > 0 && (
            <section className="mb-6 rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
              <h3 className="mb-3 text-sm font-semibold text-amber-300">ბე ისტორია</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">დრო</th>
                      <th className="pb-2 pr-3">ტიპი</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3">მყიდველი / პროდუქტი</th>
                      <th className="pb-2 pr-3 text-right">რაოდენობა / თანხა</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditHistory.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(row.at)}</td>
                        <td className={`py-2 pr-3 ${row.kind === "pay" ? "text-emerald-400" : "text-sky-400"}`}>
                          {row.kind === "pay" ? "გადახდა" : "მიწოდება"}
                        </td>
                        <td className="py-2 pr-3">{row.branch}</td>
                        <td className="py-2 pr-3">
                          <span className="text-zinc-300">{row.buyer}</span>
                          <span className="text-zinc-500"> · {row.productName}</span>
                        </td>
                        <td className={`py-2 pr-3 text-right font-medium ${row.kind === "pay" ? "text-emerald-400" : "text-sky-400"}`}>
                          {row.kind === "pay"
                            ? `+${formatMoney(row.amount ?? 0)}${row.paymentMethod ? ` · ${row.paymentMethod}` : ""}`
                            : `+${row.quantity} ც`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              გაყიდვები და ხარჯები
              {unlocked && <span className="ml-2 text-xs font-normal text-zinc-500">(წაშლა ერთი PIN-ით სესიაში)</span>}
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">ცარიელია</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">დრო</th>
                      <th className="pb-2 pr-3">ტიპი</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3">აღწერა</th>
                      <th className="pb-2 pr-3">კომენტარი</th>
                      <th className="pb-2 pr-3 text-right">თანხა</th>
                      {unlocked && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((t) => (
                      <tr key={t.id} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(t.date)}</td>
                        <td className={`py-2 pr-3 ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.type === "sale"
                            ? (t.orderCompletedAt ? "გაყიდვა" : t.paymentStatus === "ბე (ავანსი)" ? "ბე" : "გაყიდვა")
                            : "ხარჯი"}
                          {t.source === "branch" && <span className="ml-1 text-xs text-zinc-500">📱</span>}
                        </td>
                        <td className="py-2 pr-3">{t.branch}</td>
                        <td className="py-2 pr-3">{txLabel(t)}</td>
                        <td className="py-2 pr-3 text-zinc-500">{t.comment || txDetail(t)}</td>
                        <td className={`py-2 pr-3 text-right font-medium ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.type === "sale" ? "+" : "-"}{formatMoney(t.amount)}
                        </td>
                        {unlocked && (
                          <td className="py-2">
                            <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => deleteTx(t.id)}>✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "obligations" && (
        !unlocked ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold">ვალდებულებები</h2>
            <p className="text-sm text-zinc-500">შეიყვანეთ ადმინ კოდი ზემოთ.</p>
          </section>
        ) : (
        <section className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="თვე">
              <input type="month" className={inputCls} value={obMonth} onChange={(e) => setObMonth(e.target.value)} />
            </Field>
          </div>

          <form onSubmit={addObligation} className="rounded-xl border border-violet-900/50 bg-violet-950/10 p-5">
            <h2 className="mb-4 text-lg font-semibold text-violet-300">ახალი ვალდებულება</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="დასახელება"><input className={inputCls} value={obName} onChange={(e) => setObName(e.target.value)} placeholder="მაგ: გიორგი ხელფასი" required /></Field>
              <Field label="თანხა"><input className={inputCls} type="number" min={0} step={0.01} value={obAmount} onChange={(e) => setObAmount(e.target.value)} required /></Field>
              <Field label="ფილიალი">
                <select className={inputCls} value={obBranch} onChange={(e) => setObBranch(e.target.value as ExpenseBranch | "ყველა")}>
                  <option value="ყველა">ყველა</option>
                  {EXPENSE_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="კატეგორია">
                <select className={inputCls} value={obCategory} onChange={(e) => setObCategory(e.target.value as ExpenseCategory)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-violet-200">
              <input type="checkbox" checked={obRecurring} onChange={(e) => setObRecurring(e.target.checked)} />
              ყოველთვიური ფიქსირებული ხარჯი (ყოველ თვეში ავტომატურად გამოჩნდება)
            </label>
            <button type="submit" className={`${btnCls} mt-4`}>დამატება და შენახვა</button>
          </form>

          {recurringList.length > 0 && (
            <div className="rounded-xl border border-violet-900/40 bg-violet-950/10 p-4">
              <h3 className="mb-3 text-sm font-semibold text-violet-300">ყოველთვიური შაბლონები</h3>
              <div className="space-y-2">
                {recurringList.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-violet-900/30 bg-zinc-900/40 px-3 py-2 text-sm">
                    <span>{r.name} · {r.category} · {formatMoney(r.amount)}</span>
                    <button type="button" className="text-xs text-red-400" onClick={() => deleteRecurring(r.id)}>წაშლა</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="თვის ვალდებულება" value={formatMoney(obSummary.total)} />
            <Stat label="ფარული" value={formatMoney(obSummary.paid)} accent="text-emerald-400" />
            <Stat label="დარჩენილი" value={formatMoney(obSummary.remaining)} accent="text-amber-400" />
          </div>

          <div className="rounded-xl border border-zinc-800 p-5">
            <h3 className="mb-4 font-semibold">სია</h3>
            {obSummary.items.length === 0 ? (
              <p className="text-sm text-zinc-500">ვალდებულებები არ არის დამატებული</p>
            ) : (
              <div className="space-y-3">
                {obSummary.items.map((o: Obligation) => {
                  const pct = o.amount ? Math.round((o.paid / o.amount) * 100) : 0;
                  const payments = paymentsForObligation(activeStore, o.id);
                  return (
                    <div key={o.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                      <div className="mb-2 flex justify-between">
                        <span className="font-medium">
                          {o.name}
                          {o.recurringId && <span className="ml-2 text-xs text-violet-400">ყოველთვიური</span>}
                        </span>
                        <button type="button" className="text-xs text-red-400" onClick={() => deleteObligation(o.id)}>წაშლა</button>
                      </div>
                      <div className="mb-1 flex justify-between text-sm text-zinc-400">
                        <span>{o.branch} · {o.category}</span>
                        <span>{formatMoney(o.paid)} / {formatMoney(o.amount)}</span>
                      </div>
                      <div className="mb-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div className={`h-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      {o.paid < o.amount ? (
                        <div className="mt-2 rounded-lg border border-violet-900/40 bg-violet-950/10 p-3">
                          <p className="mb-2 text-xs text-amber-400">დარჩენილი: {formatMoney(o.amount - o.paid)}</p>
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[90px] flex-1">
                              <label className={labelCls}>თანხა</label>
                              <input className={inputCls} type="number" min={0} step={0.01} max={o.amount - o.paid}
                                value={obPayInputs[o.id] ?? ""}
                                onChange={(e) => setObPayInputs((m) => ({ ...m, [o.id]: e.target.value }))}
                                placeholder={`მაქს ${(o.amount - o.paid).toFixed(0)}`}
                              />
                            </div>
                            <div className="min-w-[100px] flex-1">
                              <label className={labelCls}>მეთოდი</label>
                              <select className={inputCls}
                                value={obPayMethods[o.id] ?? "ქეში (ნაღდი)"}
                                onChange={(e) => setObPayMethods((m) => ({ ...m, [o.id]: e.target.value as PaymentMethod }))}
                              >
                                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                            <div className="min-w-[100px] flex-1">
                              <label className={labelCls}>საიდან</label>
                              <select className={inputCls}
                                value={obPayBranches[o.id] ?? (o.branch !== "ყველა" ? o.branch : "საერთო")}
                                onChange={(e) => setObPayBranches((m) => ({ ...m, [o.id]: e.target.value as ExpenseBranch }))}
                              >
                                {EXPENSE_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>
                            <button type="button" className={`${btnCls} bg-violet-600 hover:bg-violet-500`} onClick={() => payObligation(o.id)}>გასტუმრება</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-400">სრულად გასტუმრებული ✓</p>
                      )}
                      {payments.length > 0 && (
                        <div className="mt-2 border-t border-zinc-800 pt-2">
                          <p className="mb-1 text-xs text-zinc-500">გადახდების ისტორია:</p>
                          {payments.map((p) => (
                            <div key={p.id} className="flex justify-between text-xs text-emerald-400/90">
                              <span>{formatDate(p.paidAt)} · {p.note || "გადახდა"}{p.paymentMethod ? ` · ${p.paymentMethod}` : ""}{p.branch ? ` · ${p.branch}` : ""}</span>
                              <span>+{formatMoney(p.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        )
      )}

      {tab === "reports" && (
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} onClick={() => loadReport("today")}>დღევანდელი</button>
            <button type="button" className={btnCls} onClick={() => loadReport("month")}>მიმდინარე თვე</button>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 p-4">
            <Field label="დან"><input type="date" className={inputCls} value={repFrom} onChange={(e) => setRepFrom(e.target.value)} /></Field>
            <Field label="მდე"><input type="date" className={inputCls} value={repTo} onChange={(e) => setRepTo(e.target.value)} /></Field>
            <Field label="ფილიალი">
              <select className={inputCls} value={repBranch} onChange={(e) => setRepBranch(e.target.value as Branch | "ყველა")}>
                <option value="ყველა">ყველა</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <button type="button" className={btnCls} disabled={!repFrom || !repTo} onClick={() => loadReport("period", repFrom, repTo)}>პერიოდი</button>
          </div>

          {report && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h3 className="mb-4 font-semibold">
                {report.from === report.to ? report.from : `${report.from} — ${report.to}`} · {report.branch}
              </h3>
              <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="შემოსავალი" value={formatMoney(report.revenue)} accent="text-emerald-400" />
                <Stat label="ხარჯები" value={formatMoney(report.expenses)} accent="text-red-400" />
                <Stat label="ნეტო" value={formatMoney(report.net)} accent={report.net >= 0 ? "text-emerald-400" : "text-red-400"} />
                <Stat label="ვალდ. ფარული" value={formatMoney(report.obligationPaid)} accent="text-violet-300" />
                <Stat label="ვალდ. დარჩენილი" value={formatMoney(report.obligationRemaining)} accent="text-amber-400" />
              </div>
              {report.days.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-4">დღე</th>
                      <th className="pb-2 pr-4 text-right">შემოსავალი</th>
                      <th className="pb-2 pr-4 text-right">ხარჯი</th>
                      <th className="pb-2 text-right">ნეტო</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((d) => (
                      <tr key={d.date} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-4">{d.date}</td>
                        <td className="py-2 pr-4 text-right text-emerald-400">{formatMoney(d.revenue)}</td>
                        <td className="py-2 pr-4 text-right text-red-400">{formatMoney(d.expenses)}</td>
                        <td className={`py-2 text-right ${d.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatMoney(d.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "inventory" && !loading && (
        <section className="space-y-6">
          {!unlocked && (
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
              ნახვა ხელმისაწვდომია. რედაქტირებისთვის შეიყვანეთ ადმინ კოდი ზემოთ.
            </div>
          )}

          {unlocked && (
          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={saveBranchCash} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-4 text-lg font-semibold text-sky-400">ფილიალის საწყისი ნაშთები</h2>
              <p className="mb-3 text-xs text-zinc-500">ცვლილება ავტომატურად ინახება (0.6 წმ შემდეგ)</p>
              <div className="mb-3">
                <Field label="ფილიალი">
                  <select className={inputCls} value={invBranch} onChange={(e) => setInvBranch(e.target.value as Branch)}>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="ქეში">
                  <input className={inputCls} type="number" step={0.01} value={cashForm.cash} onChange={(e) => setCashForm((c) => ({ ...c, cash: parseNum(e.target.value) }))} />
                </Field>
                <Field label="ბარათი">
                  <input className={inputCls} type="number" step={0.01} value={cashForm.card} onChange={(e) => setCashForm((c) => ({ ...c, card: parseNum(e.target.value) }))} />
                </Field>
                <Field label="ანგარიში">
                  <input className={inputCls} type="number" step={0.01} value={cashForm.bank} onChange={(e) => setCashForm((c) => ({ ...c, bank: parseNum(e.target.value) }))} />
                </Field>
              </div>
              <button type="submit" className={`${btnCls} mt-4`}>ახლავე შენახვა</button>
            </form>

            <form onSubmit={setStock} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-4 text-lg font-semibold text-emerald-400">მარაგის დაყენება</h2>
              <p className="mb-3 text-xs text-zinc-500">აირჩიეთ პროდუქტი სიიდან · რაოდენობა ავტომატურად ინახება</p>
              <div className="grid gap-3">
                <Field label="ფილიალი">
                  <select className={inputCls} value={invBranch} onChange={(e) => setInvBranch(e.target.value as Branch)}>
                    {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <div className="relative">
                  <Field label="პროდუქტი">
                    <input className={inputCls} value={invSearch} onChange={(e) => { setInvSearch(e.target.value); setInvSelected(null); }} placeholder="კოდი ან სახელი..." autoComplete="off" />
                  </Field>
                  {invSearch && !invSelected && filteredInvProducts.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                      {filteredInvProducts.map((p) => (
                        <li key={p.code}>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => pickInvProduct(p)}>
                            <span className="text-emerald-400">{p.code}</span> — {p.name}
                            <span className="float-right text-zinc-500">მარაგი: {getStock(inventory, invBranch, p.code)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Field label="რაოდენობა (მთლიანი)">
                  <input className={inputCls} type="number" min={0} value={invQty} onChange={(e) => setInvQty(e.target.value)} required />
                </Field>
              </div>
              <button type="submit" className={`${btnCls} mt-4`} disabled={!invSelected}>ახლავე შენახვა</button>
            </form>
          </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-medium text-zinc-400">საწყისი ნაშთები (ფილიალის ბალანსი)</h3>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {BRANCHES.map((b) => {
                const opening = activeStore.branchCash[b] ?? emptyBranchCash();
                return (
                  <div key={b} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    <h3 className="mb-2 font-semibold">{b}</h3>
                    <div className="space-y-1 text-sm">
                      <p>ქეში: <span className="text-emerald-400">{formatMoney(opening.cash)}</span></p>
                      <p>ბარათი: <span className="text-sky-400">{formatMoney(opening.card)}</span></p>
                      <p>ანგარიში: <span className="text-violet-400">{formatMoney(opening.bank)}</span></p>
                    </div>
                  </div>
                );
              })}
            </div>
            <h3 className="mb-3 text-sm font-medium text-zinc-400">მიმდინარე ბალანსი (საწყისი + ტრანზაქციები)</h3>
            <div className="grid gap-3 sm:grid-cols-3">
            {BRANCHES.map((b) => {
              const cash = calcBalances(tx, b, activeStore.branchCash);
              return (
                <div key={b} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="mb-2 font-semibold">{b}</h3>
                  <div className="space-y-1 text-sm">
                    <p>ქეში: <span className="text-emerald-400">{formatMoney(cash.cash)}</span></p>
                    <p>ბარათი: <span className="text-sky-400">{formatMoney(cash.card)}</span></p>
                    <p>ანგარიში: <span className="text-violet-400">{formatMoney(cash.bank)}</span></p>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">პროდუქციის მარაგი</h2>
              <select className={`${inputCls} w-auto`} value={invFilter} onChange={(e) => setInvFilter(e.target.value as Branch | "ყველა")}>
                <option value="ყველა">ყველა ფილიალი</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {products.length === 0 ? (
              <p className="text-sm text-zinc-500">პროდუქტები ჯერ არ არის ჩატვირთული — შეამოწმეთ Google Sheets გაზიარება</p>
            ) : inventoryRows.length === 0 ? (
              <p className="text-sm text-zinc-500">მარაგი ცარიელია — დაამატეთ პროდუქტები ზემოთ (PIN-ით)</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">კოდი</th>
                      <th className="pb-2 pr-3">სახელი</th>
                      {BRANCHES.map((b) => (
                        <th key={b} className="pb-2 pr-3 text-right">{b}</th>
                      ))}
                      <th className="pb-2 text-right">სულ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows.map((r) => (
                      <tr key={r.code} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 text-emerald-400">{r.code}</td>
                        <td className="py-2 pr-3">{r.name}</td>
                        {r.perBranch.map((q, i) => (
                          <td key={i} className={`py-2 pr-3 text-right ${q <= 0 ? "text-zinc-600" : q < 5 ? "text-amber-400" : ""}`}>
                            {q}
                          </td>
                        ))}
                        <td className="py-2 text-right font-medium">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              გაყიდვისას მარაგი ავტომატურად მცირდება. ფილიალის ანგარიშიც ცვლის მარაგს და ბალანსს.
            </p>
          </div>
        </section>
      )}

      {tab === "branches" && !loading && (
        <section className="space-y-6">
          <div className="rounded-xl border border-zinc-800 p-5">
            <h2 className="mb-4 font-semibold">ფილიალის ლინკები</h2>
            <p className="mb-2 text-sm text-zinc-500">ადმინ პანელი: <code className="text-emerald-400">{env.appUrl || (typeof window !== "undefined" ? window.location.origin : "")}</code></p>
            <p className="mb-4 text-sm text-zinc-500">გაუგზავნეთ თითოეულ ფილიალს თავისი ლინკი. დღის ბოლოს შეავსებენ ანგარიშს.</p>
            {BRANCHES.map((b) => {
              const token = activeStore.branchTokens[b];
              const link = branchLink(token);
              return (
              <div key={b} className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">{b}</p>
                  <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => navigator.clipboard.writeText(link)}>კოპირება</button>
                </div>
                <code className="block break-all text-xs text-emerald-400">{link}</code>
              </div>
            );})}
          </div>

          <div className="rounded-xl border border-zinc-800 p-5">
            <h2 className="mb-4 font-semibold">ფილიალის ანგარიშები {unlocked && <span className="text-xs text-zinc-500">(წაშლა კოდით)</span>}</h2>
            {branchReports.length === 0 ? (
              <p className="text-sm text-zinc-500">ჯერ არ არის მიღებული</p>
            ) : (
              <div className="space-y-3">
                {branchReports.map((r: BranchDailyReport) => (
                  <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
                    <div className="mb-2 flex justify-between">
                      <span className="font-medium">{r.branch} · {r.date}{r.submittedBy ? ` · ${r.submittedBy}` : ""}</span>
                      <span className="text-zinc-500">{formatDate(r.submittedAt)}</span>
                    </div>
                    {r.sales?.length ? (
                      <div className="mb-2 space-y-1">
                        {r.sales.map((s, i) => (
                          <p key={i} className="text-emerald-400">
                            +{formatMoney(s.amount)} — {s.productName} ×{s.quantity} · {s.paymentMethod}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-emerald-400">+{formatMoney(r.salesTotal)} — {r.salesNote}</p>
                    )}
                    {r.expenses?.length ? (
                      <div className="space-y-1">
                        {r.expenses.map((ex, i) => (
                          <p key={i} className="text-red-400">
                            -{formatMoney(ex.amount)} — {ex.category}: {ex.comment} · {ex.paymentMethod}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-red-400">-{formatMoney(r.expensesTotal)} — {r.expensesNote}</p>
                    )}
                    {unlocked && (
                      <button type="button" className="mt-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteReport(r.id)}>
                        წაშლა (ხელახლა შეავსონ)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "employees" && (
        !unlocked ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold">თანამშრომლები</h2>
            <p className="text-sm text-zinc-500">შეიყვანეთ ადმინ კოდი ზემოთ.</p>
          </section>
        ) : (
        <section className="space-y-6">
          <form onSubmit={addEmployee} className="rounded-xl border border-teal-900/50 bg-teal-950/10 p-5">
            <h2 className="mb-4 text-lg font-semibold text-teal-300">ახალი თანამშრომელი</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="სახელი"><input className={inputCls} value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="მაგ: ნინო" required /></Field>
              <Field label="ფილიალი">
                <select className={inputCls} value={empBranch} onChange={(e) => setEmpBranch(e.target.value as Branch)}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="დღიური ხელფასი (₾)">
                <input className={inputCls} type="number" min={0} step={0.01} value={empWage} onChange={(e) => setEmpWage(e.target.value)} placeholder="მაგ: 40" />
              </Field>
              <div className="flex items-end">
                <button type="submit" className={`${btnCls} w-full`}>დამატება</button>
              </div>
            </div>
          </form>

          <div className="rounded-xl border border-zinc-800 p-5">
            <h3 className="mb-4 font-semibold">თანამშრომლების სია</h3>
            {activeStore.employees.length === 0 ? (
              <p className="text-sm text-zinc-500">თანამშრომლები არ არის დამატებული</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">სახელი</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3 text-right">დღიური ხელფასი</th>
                      <th className="pb-2 pr-3">სტატუსი</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeStore.employees.map((emp: Employee) => (
                      <tr key={emp.id} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 font-medium">{emp.name}</td>
                        <td className="py-2 pr-3">{emp.branch}</td>
                        <td className="py-2 pr-3 text-right">{formatMoney(emp.dailyWage)}</td>
                        <td className="py-2 pr-3">
                          <span className={emp.active ? "text-emerald-400" : "text-zinc-500"}>
                            {emp.active ? "აქტიური" : "გათიშული"}
                          </span>
                        </td>
                        <td className="py-2">
                          <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => toggleEmployee(emp.id)}>
                            {emp.active ? "გათიშვა" : "ჩართვა"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">სამუშაო დღეები / მოპწიჩკვა</h3>
              <Field label="თვე">
                <input type="month" className={inputCls} value={empMonthFilter} onChange={(e) => setEmpMonthFilter(e.target.value)} />
              </Field>
            </div>
            {(() => {
              const monthAttendance = activeStore.attendance.filter(
                (a: AttendanceRecord) => a.date.startsWith(empMonthFilter)
              );
              const empMap = new Map<string, { name: string; branch: Branch; days: string[]; wage: number }>();
              for (const emp of activeStore.employees.filter((e: Employee) => e.active)) {
                empMap.set(emp.id, { name: emp.name, branch: emp.branch, days: [], wage: emp.dailyWage });
              }
              for (const a of monthAttendance) {
                const row = empMap.get(a.employeeId);
                if (row) row.days.push(a.date);
              }
              const rows = [...empMap.entries()].map(([id, data]) => ({
                id,
                ...data,
                total: data.days.length * data.wage,
              }));
              return rows.length === 0 ? (
                <p className="text-sm text-zinc-500">აქტიური თანამშრომლები არ არის</p>
              ) : (
                <div className="space-y-3">
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{r.name} · <span className="text-zinc-400">{r.branch}</span></span>
                        <span className="text-sm text-teal-400">{r.days.length} დღე · {formatMoney(r.total)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.days.sort().map((d) => (
                          <span key={d} className="rounded bg-teal-900/30 px-2 py-0.5 text-xs text-teal-300">{d.slice(5)}</span>
                        ))}
                        {r.days.length === 0 && <span className="text-xs text-zinc-500">არ მუშაობდა</span>}
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg border border-teal-900/40 bg-teal-950/10 p-3 text-sm">
                    <span className="font-medium text-teal-300">ჯამი ხელფასი ({empMonthFilter}):</span>{" "}
                    <span className="text-teal-400">{formatMoney(rows.reduce((s, r) => s + r.total, 0))}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
        )
      )}
    </div>
  );
}
