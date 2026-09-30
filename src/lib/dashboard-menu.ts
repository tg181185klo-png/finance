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

/** მენიუ აღრიცხვის წიგნების მიხედვით, არა ანბანით */
export const DASHBOARD_MENU_GROUPS: { label: string; tabs: DashboardTab[] }[] = [
  {
    label: "შემოსავალი",
    tabs: [
      { id: "main", label: "შემოსავლის ჩაწერა" },
      { id: "clients", label: "მომხმარებლები" },
      { id: "employee-bonus", label: "ვინ მოიყვანა და ბონუსი" },
    ],
  },
  {
    label: "ხარჯი",
    tabs: [{ id: "expenses", label: "ხარჯის ჩაწერა" }],
  },
  {
    label: "ვალდებულებები",
    tabs: [
      { id: "obligations", label: "მიმდინარე ვალდებულებები" },
      { id: "balances", label: "საიდან გავისტუმრო" },
      { id: "payments", label: "გადახდები" },
      { id: "bank", label: "საბანკო ანგარიში" },
    ],
  },
  {
    label: "რეპორტები",
    tabs: [
      { id: "reports", label: "რეპორტების ამოღება" },
      { id: "overview", label: "მიმოხილვა" },
      { id: "owner", label: "მფლობელის მაჩვენებლები" },
    ],
  },
  {
    label: "სამუშაო",
    tabs: [
      { id: "branches", label: "ფილიალები" },
      { id: "employees", label: "თანამშრომლები" },
      { id: "inventory", label: "მარაგი" },
      { id: "costing", label: "თვითღირებულება" },
    ],
  },
  {
    label: "სისტემა",
    tabs: [{ id: "system", label: "აღრიცხვის რუკა" }],
  },
];

export const ALL_DASHBOARD_TABS: DashboardTab[] = DASHBOARD_MENU_GROUPS.flatMap((g) => g.tabs);

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
