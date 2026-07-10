const KEY = "fin-admin-pin";

export function getSessionPin(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(KEY) || "";
}

export function setSessionPin(pin: string) {
  sessionStorage.setItem(KEY, pin);
}

export function clearSessionPin() {
  sessionStorage.removeItem(KEY);
}
