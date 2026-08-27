import { roleLabel } from "@spaceship-defender/client-shared";
import type { CrewRole, EncounterPhase } from "@spaceship-defender/protocol";

export function encounterLabel(phase: EncounterPhase): string {
  return phase === "combat" ? "бой" : phase === "intermission" ? "передышка" : "результат";
}

export function latencyRoleLabel(role: CrewRole): string {
  return role === "shield" ? "Щит" : roleLabel(role);
}

/** The server refuses a create by throwing a coded error; these two are expected in play. */
