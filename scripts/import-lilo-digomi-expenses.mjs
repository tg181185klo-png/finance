import fs from "fs";
import path from "path";

const API = "https://finance-eight-ruddy-60.vercel.app/api/import/expenses";
const PIN = process.env.ADMIN_PIN || "12345";
const ROOT = "C:/Users/User/Downloads/xarjebi";

const months = {
  marti: "2026-03",
  aprili: "2026-04",
  maisi: "2026-05",
  ivnisi: "2026-06",
  ivlisi: "2026-07",
  agvisto: "2026-08",
};

const branchDefault = {
  lilo: "ლილო",
  digomi: "დიღომი",
};

async function importFile(folder, month, branchKey, fileName) {
  const filePath = path.join(ROOT, folder, fileName);
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("files", new Blob([buf]), fileName);
  form.append("branch", branchDefault[branchKey]);
  form.append("month", month);
  form.append("replaceExisting", "true");
  form.append("pin", PIN);

  const res = await fetch(API, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${fileName}: HTTP ${res.status}`);
  return data;
}

async function main() {
  for (const branchKey of ["lilo", "digomi"]) {
    for (const [folder, month] of Object.entries(months)) {
      const dir = path.join(ROOT, folder);
      const fileName = fs.readdirSync(dir).find((f) => f.toLowerCase().includes(branchKey) && f.endsWith(".xlsx"));
      if (!fileName) {
        console.log("SKIP missing", branchKey, folder);
        continue;
      }
      try {
        const data = await importFile(folder, month, branchKey, fileName);
        const cats = [...new Set((data.transactions || []).filter((t) => t.type === "expense" && t.branch === branchDefault[branchKey]).map((t) => t.category))].sort();
        console.log(
          `OK ${fileName} (${month}) -> ${data.imported} ხარჯი, ${data.importedDeposits || 0} შენატანი, ${data.total} ₾`,
          cats.length ? `[${cats.join(", ")}]` : ""
        );
      } catch (err) {
        console.error("FAIL", fileName, err instanceof Error ? err.message : err);
      }
    }
  }
}

main();
