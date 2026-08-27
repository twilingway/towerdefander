import type { EncounterPhase } from "@spaceship-defender/protocol";

export function shellPhaseModifier(phase: EncounterPhase | undefined): string {
  if (phase === "combat") return " controller-shell--combat";
  return phase === "result" ? " controller-shell--result" : "";
}

export function playCardPhaseModifier(phase: EncounterPhase | undefined): string {
  if (phase === "combat") return " play-card--combat";
  if (phase === "intermission") return " play-card--intermission";
  return phase === "result" ? " play-card--result" : "";
}
