export const ENTRY_ACTION_PIN = "121345";

/** წაშლა და რედაქტირება ჩასაწერი ველებიდან. აბრუნებს პაროლს, თუ სწორია. */
export function confirmedActionPin(): string | null {
  if (typeof window === "undefined") return null;
  const entered = window.prompt("წაშლის ან რედაქტირების პაროლი");
  if (entered === null) return null;
  if (entered.trim() !== ENTRY_ACTION_PIN) {
    window.alert("პაროლი არასწორია");
    return null;
  }
  return ENTRY_ACTION_PIN;
}
