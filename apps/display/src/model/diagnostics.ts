/**
 * Whether this page was asked for instruments.
 *
 * Not gated on a development build, unlike the visible-demo flag: the
 * measurement that matters is taken on the real deployment, from a phone, over
 * the public path. Gated on nothing but the address, so a player who did not ask
 * never sees the panel and never pays for it.
 */
export function isDiagnosticsRequested(search: string): boolean {
  return new URLSearchParams(search).get("diag") === "1";
}
