"use client";

import BackupPanel from "@/components/BackupPanel";
import type { DashboardTabId } from "@/lib/dashboard-menu";

type Props = {
  onOpen?: (tab: DashboardTabId) => void;
};

type Module = {
  id: string;
  title: string;
  description: string;
  status: "ready" | "can";
  links?: { label: string; tab: DashboardTabId }[];
  points: string[];
};

const MODULES: Module[] = [
  {
    id: "income",
    title: "შემოსავალი",
    description: "რა შემოვიდა, ვინ იყო მომხმარებელი, ვინ მოიყვანა და ვის ერიცხება ბონუსი.",
    status: "ready",
    links: [
      { label: "შემოსავლის ჩაწერა", tab: "main" },
      { label: "მომხმარებლები", tab: "clients" },
      { label: "ბონუსი", tab: "employee-bonus" },
    ],
    points: [
      "შემოსავალზე იწერება მომხმარებელი და მომყოლი თანამშრომელი",
      "ბონუსი ერიცხება იმას, ვინ მოიყვანა",
      "დისტრიბუციის შეკვეთები აქვე შემოდის და ცალკე არ იწერება",
      "ფილიალის რეპორტიც იგივე შემოსავალში ჩანს",
    ],
  },
  {
    id: "expense",
    title: "ხარჯი",
    description: "ვინ დახარჯა, რა თანხა და რაში გავიდა ეს ხარჯი.",
    status: "ready",
    links: [{ label: "ხარჯის ჩაწერა", tab: "expenses" }],
    points: [
      "ვინ დახარჯა",
      "თანხა",
      "რაში გავიდა — კატეგორია",
      "საიდან გაისტუმრა: ქეში, ბარათი ან ანგარიში",
    ],
  },
  {
    id: "obligations",
    title: "ვალდებულებები",
    description: "რა არის მიმდინარე ვალდებულება და საიდან შეიძლება გავისტუმრო.",
    status: "ready",
    links: [
      { label: "მიმდინარე ვალდებულებები", tab: "obligations" },
      { label: "საიდან გავისტუმრო", tab: "balances" },
      { label: "საბანკო ანგარიში", tab: "bank" },
    ],
    points: [
      "მისაღები: რაც მომხმარებელს უნდა შემოიტანოს",
      "გადასახდელი: ხელფასი, იჯარა და სხვა",
      "გასტუმრება ქეშიდან, ბარათიდან ან ანგარიშიდან",
      "ნაშთი გიჩვენებს, საიდან გყოფნის",
    ],
  },
  {
    id: "reports",
    title: "რეპორტები",
    description: "შემოსავალი, ხარჯი, ბონუსი და ვალდებულება ერთად ამოიღება.",
    status: "ready",
    links: [
      { label: "რეპორტების ამოღება", tab: "reports" },
      { label: "მიმოხილვა", tab: "overview" },
    ],
    points: [
      "პერიოდი და ფილიალი",
      "Excel-ში გატანა",
      "მფლობელის მაჩვენებლები",
      "დისტრიბუციის ხაზებიც შედის, რადგან სინქრონშია",
    ],
  },
];

const CONNECTIONS = [
  {
    from: "დისტრიბუცია",
    to: "შემოსავალი",
    how: "შეკვეთის ყოველ ცვლილებაზე თავისით სინქრონდება",
  },
  {
    from: "ვინ მოიყვანა",
    to: "ბონუსი",
    how: "შემოსავალზე მითითებული თანამშრომელი ბონუსის რეპორტში ჩანს",
  },
  {
    from: "ხარჯი",
    to: "ვალდებულება",
    how: "კატეგორიით ემთხვევა გადასახდელს",
  },
  {
    from: "გასტუმრება",
    to: "ნაშთი",
    how: "ქეში, ბარათი ან ანგარიში — საიდან ჩამოიჭრა",
  },
];

const CAN_DO = [
  "შემოსავალი ცალკე: მომხმარებელი, მომყოლი, ბონუსი",
  "ხარჯი ცალკე: ვინ დახარჯა, თანხა, რაში გავიდა",
  "ვალდებულება ცალკე: რა გვაქვს და საიდან გავისტუმრებთ",
  "რეპორტი ამ ოთხ წიგნზე",
  "დისტრიბუცია მიბმული რჩება და ცვლილებასთან ერთად შემოდის",
];

export default function AccountingSystemPanel({ onOpen }: Props) {
  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/80">
          ფინანსური აღრიცხვა
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          ოთხი წიგნი
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          შემოსავალი, ხარჯი, ვალდებულება და რეპორტი ცალ-ცალკეა. დისტრიბუცია შემოსავალზე მიბმული
          რჩება და იქაური ცვლილება აქაც შემოდის.
        </p>
      </div>

      <BackupPanel />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">რას გაძლევს სისტემა</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CAN_DO.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300"
            >
              <span className="mr-2 text-emerald-400">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-zinc-200">მოდულები და კავშირი</h3>
        <p className="mb-4 text-xs text-zinc-500">
          ქვემოთ — სისტემის ნაწილები. მწვანე = უკვე მუშაობს აპში. დააჭირე ღილაკს შესაბამის გვერდზე
          გადასასვლელად.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {MODULES.map((m) => (
            <article
              key={m.id}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-zinc-100">{m.title}</h4>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    m.status === "ready"
                      ? "bg-emerald-950/60 text-emerald-300"
                      : "bg-amber-950/50 text-amber-300"
                  }`}
                >
                  {m.status === "ready" ? "მუშაობს" : "შეიძლება"}
                </span>
              </div>
              <p className="mb-3 text-sm text-zinc-400">{m.description}</p>
              <ul className="mb-4 flex-1 space-y-1.5 text-xs text-zinc-500">
                {m.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-zinc-600">·</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              {m.links && onOpen && (
                <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
                  {m.links.map((l) => (
                    <button
                      key={l.tab + l.label}
                      type="button"
                      className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-600 hover:bg-emerald-900/40"
                      onClick={() => onOpen(l.tab)}
                    >
                      → {l.label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">როგორ უკავშირდება ერთმანეთს</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-3">საიდან</th>
                <th className="pb-2 pr-3">სად</th>
                <th className="pb-2">კავშირი</th>
              </tr>
            </thead>
            <tbody>
              {CONNECTIONS.map((c) => (
                <tr key={c.from + c.to} className="border-b border-zinc-800/50">
                  <td className="py-2.5 pr-3 font-medium text-zinc-200">{c.from}</td>
                  <td className="py-2.5 pr-3 text-emerald-300/90">{c.to}</td>
                  <td className="py-2.5 text-zinc-400">{c.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {onOpen && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              onClick={() => onOpen("overview")}
            >
              გახსენი მიმოხილვა
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              onClick={() => onOpen("balances")}
            >
              ბალანსები
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              onClick={() => onOpen("bank")}
            >
              საბანკო ანგარიში
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
        <h3 className="mb-2 text-sm font-semibold text-sky-200">რას შევძლებ შენთვის შემდეგ</h3>
        <p className="mb-3 text-sm text-zinc-400">
          ეს გვერდი არის შენი აღრიცხვის რუკა. უკვე აგებულია ძირითადი ნაწილები. შემიძლია გავაგრძელო
          იმავე ლოგიკით:
        </p>
        <ul className="space-y-2 text-sm text-zinc-300">
          <li>· ამონაწერის გასავლების ავტომატური მიბმა ხარჯებთან და ვალდებულებებთან</li>
          <li>· დღის ბოლოს ერთი შეჯამება: შემოსავალი / ხარჯი / ჩარიცხვა / ნაშთი</li>
          <li>· ბარათის ტერმინალების (ობიექტების) მიხედვით ჩარიცხვის კონტროლი</li>
          <li>· ვალდებულებების გადახდის გეგმა და შეხსენებები</li>
          <li>· ერთიანი Excel / PDF აღრიცხვის პაკეტი დღეზე ან თვეზე</li>
        </ul>
      </div>
    </section>
  );
}
