export type AppTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "finance-theme";

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "dark" || value === "light";
}

export function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(raw) ? raw : "dark";
  } catch {
    return "dark";
  }
}

export function persistTheme(theme: AppTheme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
