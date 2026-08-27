/**
 * Dev-only layout preview: display and controller both render fixtures instead
 * of joining a room, so every screen can be inspected without a server. The
 * fixtures themselves stay in each app; only the vocabulary is shared.
 */

export type PreviewPhase = "lobby" | "combat" | "intermission" | "result";

export const PREVIEW_PHASES: readonly PreviewPhase[] = [
  "lobby",
  "combat",
  "intermission",
  "result"
];

export function isPreviewMode(search: string, development: boolean): boolean {
  return development && new URLSearchParams(search).get("preview") === "1";
}

export function previewPhaseLabel(phase: PreviewPhase): string {
  if (phase === "lobby") return "Лобби";
  if (phase === "combat") return "Бой";
  return phase === "intermission" ? "Передышка" : "Итог";
}
