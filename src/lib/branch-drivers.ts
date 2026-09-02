import type { Branch, Employee } from "./types";

/** მომზიდავის dropdown-ში ლილო/დიღომში — ხელფასის რეპორტში არ ემატება */
const EXTRA_DRIVER_NAMES: Partial<Record<Branch, string[]>> = {
  ლილო: ["ლაშა ქაშაკაშვილი", "სალომე ბარდაველიძე", "ბუბა ორჯონიკიძე"],
  დიღომი: ["ლაშა ქაშაკაშვილი", "სალომე ბარდაველიძე", "ბუბა ორჯონიკიძე"],
};

/** ალტერნატიული სახელები (რეგისტრში სხვა ფორმით თუა) */
const DRIVER_NAME_ALIASES: Record<string, string[]> = {
  "სალომე ბარდაველიძე": ["ლაშა ბარდაველიძე"],
};

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function findEmployeeByName(all: Employee[], targetName: string): Employee | undefined {
  const target = normName(targetName);
  const exact = all.find((e) => e.active && normName(e.name) === target);
  if (exact) return exact;

  for (const alias of DRIVER_NAME_ALIASES[targetName] ?? []) {
    const hit = all.find((e) => e.active && normName(e.name) === normName(alias));
    if (hit) return hit;
  }

  const parts = targetName.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.length >= 4) {
    return all.find((e) => e.active && normName(e.name).includes(normName(last)));
  }
  return undefined;
}

/** ფილიალის თანამშრომლები — ხელფასი / დღის რეპორტის ავტორი */
export function branchReportEmployees(branch: Branch, all: Employee[]): Employee[] {
  return (all ?? []).filter((e) => e.branch === branch && e.active);
}

/** მომზიდავის არჩევანი — ფილიალის თანამშრომლები + განსაზღვრული დამატებითი (ლილო/დიღომი) */
export function branchDriverEmployees(branch: Branch, all: Employee[]): Employee[] {
  const base = branchReportEmployees(branch, all);
  const ids = new Set(base.map((e) => e.id));
  const extras: Employee[] = [];

  for (const name of EXTRA_DRIVER_NAMES[branch] ?? []) {
    const emp = findEmployeeByName(all, name);
    if (emp && !ids.has(emp.id)) {
      extras.push(emp);
      ids.add(emp.id);
    }
  }

  return [...base, ...extras];
}
