import type { SessionStorage } from "../reconnectionSession.js";

export function readBrowserSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function readSessionStorage(): SessionStorage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}
