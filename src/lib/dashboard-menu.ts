/** ადმინ მენიუ — ჯერ წიგნი, მერე მხოლოდ იმ წიგნის გვერდები */

export type DashboardTabId =
  | "system"
  | "owner"
  | "main"
  | "overview"
  | "balances"
  | "expenses"
  | "card-spend"
  | "clients"
  | "obligations"
  | "reports"
  | "branches"
  | "payments"
  | "bank"
  | "inventory"
  | "employees"
  | "employee-bonus"
  | "costing"
  | "actions";

export type DashboardTab = { id: DashboardTabId; label: string };

/** მთავარი ეკრანი — ოთხი წიგნის ზემოთ, იგივე overview პანელი. */
export const MAIN_PAGE_TAB: DashboardTab = { id: "overview", label: "მთავარი გვერდი" };

/** ზედა რიგი ოთხი წიგნია. დანარჩენი გვერდი იმ წიგნშია, სადაც ეძებ. */
export const DASHBOARD_MENU_GROUPS: { label: string; tabs: DashboardTab[] }[] = [
  {
    label: "შემოსავალი",
    tabs: [
      { id: "main", label: "შემოსავლის ჩაწერა" },
      { id: "clients", label: "მომხმარებლები" },
      { id: "employee-bonus", label: "ვინ მოიყვანა და ბონუსი" },
      { id: "branches", label: "ფილიალები" },
      { id: "employees", label: "თანამშრომლები" },
      { id: "inventory", label: "მარაგი" },
    ],
  },
  {
    label: "ხარჯი",
    tabs: [
      { id: "expenses", label: "ხარჯის ჩაწერა" },
      { id: "card-spend", label: "ანგარიშიდან ხარჯი" },
      { id: "costing", label: "თვითღირებულება" },
    ],
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
      { id: "actions", label: "მოქმედებები" },
      { id: "reports", label: "რეპორტების ამოღება" },
      { id: "owner", label: "მფლობელის მაჩვენებლები" },
      { id: "system", label: "აღრიცხვის რუკა" },
    ],
  },
];

export const ALL_DASHBOARD_TABS: DashboardTab[] = [
  MAIN_PAGE_TAB,
  ...DASHBOARD_MENU_GROUPS.flatMap((g) => g.tabs),
];

export function menuGroupForTab(id: DashboardTabId) {
  return DASHBOARD_MENU_GROUPS.find((g) => g.tabs.some((t) => t.id === id)) ?? DASHBOARD_MENU_GROUPS[0];
}

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
