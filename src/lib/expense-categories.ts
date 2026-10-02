import excelLabels from "./excel-labels.json";

/**
 * Excel ხარჯების „სახელი“ სვეტის მნიშვნელობები (xarjebi — ქუთაისი, ლილო, დიღომი).
 * ახალი ჩანაწერი ამ სახელს საკვანძო კატეგორიაზე გადაჰყავს.
 */
export const EXCEL_EXPENSE_LABELS = excelLabels as readonly string[];

/** არჩევის სია — მხოლოდ ძირითადი საკვანძო სიტყვები, პირადი სახელების გარეშე */
export const STANDARD_EXPENSE_CATEGORIES = [
  "ხელფასი",
  "საბიუჯეტო",
  "საწარმო",
  "ნედლეული",
  "კომუნალური",
  "საკვები",
  "ლოგისტიკა",
  "დისტრიბუცია",
  "საყოფაცხოვრებო",
  "საწვავი",
  "სესხი",
  "სხვა",
] as const;

export const ALL_EXPENSE_CATEGORIES: string[] = [...STANDARD_EXPENSE_CATEGORIES];

const BRANCH_CATEGORY_HINTS: Record<string, string> = {
  "ხელფასი": "ხელფასი",
  "საბიუჯეტო": "საბიუჯეტო — გადასახადი, დღგ",
  "საწარმო": "საწარმო — წარმოება, პროდუქცია",
  "ნედლეული": "ნედლეული — პლასტმასი, საღებავი",
  "კომუნალური": "კომუნალური — დენი, წყალი",
  "საკვები": "საკვები — კვება",
  "ლოგისტიკა": "ლოგისტიკა — ტრანსპორტი, ტაქსი",
  "დისტრიბუცია": "დისტრიბუცია",
  "საყოფაცხოვრებო": "საყოფაცხოვრებო — ჰიგიენა, დასუფთავება",
  "საწვავი": "საწვავი",
  "სესხი": "სესხი — ვალი",
  "სხვა": "სხვა — წვრილმანი",
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

const KEYWORD_SET = new Set<string>(STANDARD_EXPENSE_CATEGORIES);

/** ძველი დეტალური სახელი → საკვანძო კატეგორია */
export function keywordCategory(label: string): string {
  const text = label.trim();
  if (!text) return "სხვა";
  if (KEYWORD_SET.has(text)) return text;
  if (/ხელფას/i.test(text) || /^(ნინო|ციცი)$/i.test(text)) return "ხელფასი";
  if (/საბიუჯეტ|დღგ|დივიდენდ|ქველმოქმედ/i.test(text)) return "საბიუჯეტო";
  if (/სესხ|ვალი/i.test(text)) return "სესხი";
  if (/საწარმო|წარმოებ|პროდუქც/i.test(text)) return "საწარმო";
  if (/ნედლეულ/i.test(text)) return "ნედლეული";
  if (/კომუნალ|ელ\.?\s*ენერგ|წყალ/i.test(text)) return "კომუნალური";
  if (/საკვებ|კვებ|მზევინარ/i.test(text)) return "საკვები";
  if (/საყოფაცხოვრებ|დასუფთავ/i.test(text)) return "საყოფაცხოვრებო";
  if (/საწვავ/i.test(text)) return "საწვავი";
  if (/დისტრიბუც/i.test(text)) return "დისტრიბუცია";
  if (/ლოგისტიკ|ტრანსპორტ|ტაქს/i.test(text)) return "ლოგისტიკა";
  return "სხვა";
}

/** Excel label → საკვანძო კატეგორია; ცარიელი label → კომენტარიდან */
export function mapExpenseCategory(label: string, comment: string): string {
  const trimmed = label.trim();
  if (trimmed) {
    const known = EXCEL_LABEL_LOOKUP.get(normalizeCategoryKey(trimmed));
    return keywordCategory(known ?? trimmed);
  }
  return keywordCategory(comment);
}
