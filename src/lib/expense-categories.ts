import excelLabels from "./excel-labels.json";

/**
 * Excel ხარჯების „სახელი“ სვეტის მნიშვნელობები (xarjebi — ქუთაისი, ლილო, დიღომი).
 * იმპორტისას label ზუსტად ასე იწერება category-ში.
 */
export const EXCEL_EXPENSE_LABELS = excelLabels as readonly string[];

/** ხელით ჩაწერის დამატებითი კატეგორიები */
export const STANDARD_EXPENSE_CATEGORIES = [
  "ნედლეული",
  "წარმოება",
  "კომუნალური",
  "საკვები",
  "ლოგისტიკა",
  "დისტრიბუცია",
  "საყოფაცხოვრებო",
  "სხვა",
  "საწვავი",
  "ხელფასი",
  "კომუნალურები",
  "დღგ",
  "სესხი",
] as const;

export const ALL_EXPENSE_CATEGORIES: string[] = [
  ...new Set([...STANDARD_EXPENSE_CATEGORIES, ...EXCEL_EXPENSE_LABELS]),
].sort((a, b) => a.localeCompare(b, "ka"));

const BRANCH_CATEGORY_HINTS: Record<string, string> = {
  "ნედლეული": "ნედლეული — პლასტმასი, საღებავი",
  "წარმოება": "წარმოება — დაზგარის ნაწილები, რემონტი",
  "საწარმო": "საწარმო — საწარმოს ხარჯი",
  "კომუნალური": "კომუნალური — დენი, წყალი (ზოგადი)",
  "საკვები": "საკვები — კვება",
  "ლოგისტიკა": "ლოგისტიკა — საწვავი, მიწოდება",
  "საყოფაცხოვრებო": "საყოფაცხოვრებო — ჰიგიენა, საკანცელარიო",
  "ხელფასი": "ხელფასი (ზოგადი)",
  "სხვა": "სხვა — წვრილმანი",
  "საწვავი": "საწვავი",
  "კომუნალურები": "კომუნალურები",
};

export const BRANCH_EXPENSE_CATEGORY_OPTIONS: { value: string; label: string }[] =
  ALL_EXPENSE_CATEGORIES.map((value) => ({
    value,
    label: BRANCH_CATEGORY_HINTS[value] ?? value,
  }));

const EXCEL_LABEL_LOOKUP = new Map(
  EXCEL_EXPENSE_LABELS.map((l) => [normalizeCategoryKey(l), l])
);

function normalizeCategoryKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isWageCategory(category: string) {
  return /ხელფას/i.test(category);
}

/** Excel label → category: ზუსტად როგორც ფაილშია; ცარიელი label → კომენტარიდან */
export function mapExpenseCategory(label: string, comment: string): string {
  const trimmed = label.trim();
  if (trimmed) {
    const known = EXCEL_LABEL_LOOKUP.get(normalizeCategoryKey(trimmed));
    if (known) return known;
    return trimmed;
  }

  const text = comment.toLowerCase();
  if (/ხელფას/i.test(text)) return "ხელფასი";
  if (/დღგ/i.test(text)) return "დღგ";
  if (/სესხ/i.test(text)) return "სესხი";
  if (/დივიდენდ/i.test(text)) return "დივიდენდი";
  if (/ნედლეულ/i.test(text)) return "ნედლეული";
  if (/საწარმო/i.test(text)) return "საწარმო";
  if (/წარმოებ/i.test(text)) return "წარმოება";
  if (/საკვები|კვებ/i.test(text)) return "საკვები";
  if (/საყოფაცხოვრებ/i.test(text)) return "საყოფაცხოვრებო";
  if (/დასუფთავ/i.test(text)) return "დასუფთავება";
  if (/ელ\.?\s*ენერგ/i.test(text)) return "ელ. ენერგია";
  if (/წყალი/i.test(text)) return "წყალი";
  if (/კომუნალ/i.test(text)) return "კომუნალური";
  if (/საწვავ/i.test(text)) return "ლოგისტიკა";
  if (/ტრანსპორტ/i.test(text)) return "ტრანსპორტირება";
  if (/ტაქს/i.test(text)) return "ტაქსი";
  if (/დისტრიბუც/i.test(text)) return "დისტრიბუცია";
  if (/ვალი/i.test(text)) return "ვალი";
  if (/პროდუქც/i.test(text)) return "პროდუქცია";

  return "სხვა";
}
