/** ადმინ მენიუს ტაბები — ანბანით; დამალული ტაბები localStorage-ში */

export type DashboardTabId =
  | "system"
  | "owner"
  | "main"
  | "overview"
  | "balances"
  | "expenses"
  | "clients"
  | "obligations"
  | "reports"
  | "branches"
  | "payments"
  | "bank"
  | "inventory"
  | "employees"
  | "employee-bonus"
  | "costing";

export type DashboardTab = { id: DashboardTabId; label: string };

/** სრული სია (ანბანის მიხედვით ka) */
export const ALL_DASHBOARD_TABS: DashboardTab[] = (
  [
    { id: "balances", label: "ბალანსები" },
    { id: "payments", label: "გადახდები" },
    { id: "employee-bonus", label: "გაყიდვის ბონუსი" },
    { id: "obligations", label: "ვალდებულებები" },
    { id: "employees", label: "თანამშრომლები" },
    { id: "costing", label: "თვითღირებულება" },
    { id: "clients", label: "კლიენტები" },
    { id: "inventory", label: "მარაგი" },
    { id: "overview", label: "მიმოხილვა" },
    { id: "owner", label: "მფლობელის მაჩვენებლები" },
    { id: "reports", label: "რეპორტები" },
    { id: "bank", label: "საბანკო ანგარიში" },
    { id: "branches", label: "ფილიალები" },
    { id: "main", label: "ჩაწერა" },
    { id: "system", label: "ჩემი აღრიცხვის სისტემა" },
    { id: "expenses", label: "ხარჯები" },
  ] as DashboardTab[]
).sort((a, b) => a.label.localeCompare(b.label, "ka"));

const HIDDEN_KEY = "finance-dashboard-hidden-tabs";

export function readHiddenTabIds(): DashboardTabId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(ALL_DASHBOARD_TABS.map((t) => t.id));
    return parsed.filter((id): id is DashboardTabId => typeof id === "string" && allowed.has(id as DashboardTabId));
  } catch {
    return [];
  }
}

export function writeHiddenTabIds(ids: DashboardTabId[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(ids)]));
}

export function visibleDashboardTabs(hidden: DashboardTabId[]): DashboardTab[] {
  const hide = new Set(hidden);
  return ALL_DASHBOARD_TABS.filter((t) => !hide.has(t.id));
}

export function hiddenDashboardTabs(hidden: DashboardTabId[]): DashboardTab[] {
  const hide = new Set(hidden);
  return ALL_DASHBOARD_TABS.filter((t) => hide.has(t.id));
}
