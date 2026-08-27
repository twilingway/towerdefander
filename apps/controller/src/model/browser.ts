import type { SessionStorage } from "../reconnectionSession.js";

export function readBrowserSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function readSessionStorage(): SessionStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

/** The solo layout must survive a closed tab, so it lives in local storage. */
export function readLocalStorage(): SessionStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
