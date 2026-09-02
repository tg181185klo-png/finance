import type { Branch, BranchDailyReport, Employee, Store } from "./types";
import { addEmployeeAttendance, uid, wageForShift } from "./utils";

const REPORT_WAGE_BRANCHES: Branch[] = ["ლილო", "დიღომი"];

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveReportEmployee(store: Store, report: BranchDailyReport): Employee | undefined {
  const employees = store.employees ?? [];
  if (report.submittedEmployeeId) {
    const byId = employees.find(
      (e) => e.id === report.submittedEmployeeId && e.active && e.branch === report.branch
    );
    if (byId) return byId;
  }
  const byName = report.submittedBy?.trim();
  if (!byName) return undefined;
  const target = normName(byName);
  return employees.find(
    (e) => e.active && e.branch === report.branch && normName(e.name) === target
  );
}

export function refreshAttendanceWages(store: Store, employeeId?: string) {
  for (const rec of store.attendance ?? []) {
    if (employeeId && rec.employeeId !== employeeId) continue;
    const emp = store.employees?.find((e) => e.id === rec.employeeId);
    if (!emp) continue;
    rec.wageAmount = wageForShift(emp.dailyWage, rec.shift ?? "დღის", rec.branch);
    rec.employeeName = emp.name;
  }
}

export function recalculateEmployeeObligationFromAttendance(
  store: Store,
  employeeId: string,
  month: string
) {
  const employee = store.employees?.find((e) => e.id === employeeId);
  if (!employee) return;

  const total = (store.attendance ?? [])
    .filter((a) => a.employeeId === employeeId && a.date.startsWith(month))
    .reduce((sum, a) => sum + (a.wageAmount ?? 0), 0);

  if (!store.obligations[month]) store.obligations[month] = [];
  let obligation = store.obligations[month].find((o) => o.employeeId === employeeId);

  if (total <= 0 && !obligation) return;

  if (!obligation) {
    obligation = {
      id: uid(),
      name: `${employee.name} — ხელფასი`,
      amount: 0,
      paid: 0,
      branch: employee.branch,
      category: "ხელფასი",
      month,
      employeeId,
    };
    store.obligations[month].push(obligation);
  }

  if (total < obligation.paid) {
    throw new Error(`${employee.name}: ხელფასის ჯამი (${total}) ნაკლებია უკვე გასტუმრებულზე (${obligation.paid})`);
  }

  obligation.amount = total;
  obligation.name = `${employee.name} — ხელფასი`;
  obligation.branch = employee.branch;

  if (obligation.amount === 0 && obligation.paid === 0) {
    store.obligations[month] = store.obligations[month].filter((o) => o.id !== obligation!.id);
  }
}

export type AttendanceSyncResult = {
  added: number;
  skipped: number;
  reports: number;
  employees: string[];
};

/** ლილო/დიღომი — დღიური ხელფასი რეპორტის გამომგზავნის მიხედვით */
export function syncAttendanceFromBranchReports(
  store: Store,
  opts?: { branches?: Branch[]; fromDate?: string }
): AttendanceSyncResult {
  const branches = opts?.branches ?? REPORT_WAGE_BRANCHES;
  const fromDate = opts?.fromDate ?? "2026-09-01";
  let added = 0;
  let skipped = 0;
  const touched = new Set<string>();

  for (const report of store.branchReports ?? []) {
    if (!branches.includes(report.branch)) continue;
    if (report.date < fromDate) continue;

    const employee = resolveReportEmployee(store, report);
    if (!employee) {
      skipped += 1;
      continue;
    }

    const before = (store.attendance ?? []).length;
    addEmployeeAttendance(store, employee, report.date, "დღის", report.branch);
    const after = (store.attendance ?? []).length;
    if (after > before) added += 1;
    else skipped += 1;

    touched.add(employee.id);

    const wageAmount = wageForShift(employee.dailyWage, "დღის", report.branch);
    if (wageAmount > 0) {
      const worked = report.workedEmployees ?? [];
      if (!worked.some((w) => w.employeeId === employee.id)) {
        report.workedEmployees = [
          ...worked,
          {
            employeeId: employee.id,
            employeeName: employee.name,
            shift: "დღის",
            wageAmount,
          },
        ];
      }
    }
  }

  refreshAttendanceWages(store);
  for (const employeeId of touched) {
    const months = new Set(
      (store.attendance ?? [])
        .filter((a) => a.employeeId === employeeId && a.date >= fromDate)
        .map((a) => a.date.slice(0, 7))
    );
    for (const month of months) {
      recalculateEmployeeObligationFromAttendance(store, employeeId, month);
    }
  }

  return {
    added,
    skipped,
    reports: (store.branchReports ?? []).filter(
      (r) => branches.includes(r.branch) && r.date >= fromDate
    ).length,
    employees: [...touched],
  };
}

export function syncAllReportWageObligations(store: Store, fromDate = "2026-09-01") {
  const employeeIds = new Set<string>();
  for (const rec of store.attendance ?? []) {
    if (rec.date >= fromDate) employeeIds.add(rec.employeeId);
  }
  refreshAttendanceWages(store);
  for (const employeeId of employeeIds) {
    const months = new Set(
      (store.attendance ?? [])
        .filter((a) => a.employeeId === employeeId && a.date >= fromDate)
        .map((a) => a.date.slice(0, 7))
    );
    for (const month of months) {
      recalculateEmployeeObligationFromAttendance(store, employeeId, month);
    }
  }
}
