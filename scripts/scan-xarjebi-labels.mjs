import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { mapExpenseCategory } from "../src/lib/expense-categories.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const root = "C:/Users/User/Downloads/xarjebi";
const months = {
  marti: "2026-03",
  aprili: "2026-04",
  maisi: "2026-05",
  ivnisi: "2026-06",
  ivlisi: "2026-07",
  agvisto: "2026-08",
};

function extract(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
  });
  const headers = rows[0].map(String);
  let labelCol = -1;
  for (let i = 0; i < headers.length; i += 1) {
    if (headers[i].toLowerCase().includes("სახელ")) labelCol = i;
  }
  const typeCol = headers.findIndex((h) => h.toLowerCase().includes("ტიპ"));
  const commentCol = headers.findIndex((h) => h.toLowerCase().includes("კომენტარ"));

  const raw = new Set();
  const mapped = new Set();
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (String(row[typeCol] ?? "").trim() !== "გაცემა") continue;
    const label = String(row[labelCol] ?? "").trim();
    const comment = commentCol >= 0 ? String(row[commentCol] ?? "").trim() : "";
    if (label) raw.add(label);
    mapped.add(mapExpenseCategory(label, comment));
  }
  return { raw: [...raw].sort((a, b) => a.localeCompare(b, "ka")), mapped: [...mapped].sort((a, b) => a.localeCompare(b, "ka")) };
}

const allRaw = new Set();
const allMapped = new Set();

for (const branch of ["lilo", "digomi", "kutaisi"]) {
  console.log(`\n=== ${branch.toUpperCase()} ===`);
  for (const [folder, month] of Object.entries(months)) {
    const dir = path.join(root, folder);
    const file = fs.readdirSync(dir).find((f) => f.toLowerCase().includes(branch) && f.endsWith(".xlsx"));
    if (!file) {
      console.log(`${folder}: MISSING`);
      continue;
    }
    const { raw, mapped } = extract(path.join(dir, file));
    raw.forEach((l) => allRaw.add(l));
    mapped.forEach((l) => allMapped.add(l));
    console.log(`${folder} (${month}): raw=[${raw.join(", ")}] mapped=[${mapped.join(", ")}]`);
  }
}

console.log("\n=== ALL RAW LABELS (lilo+digomi+kutaisi) ===");
console.log([...allRaw].sort((a, b) => a.localeCompare(b, "ka")).join("\n"));
