import type { CrewRole } from "@spaceship-defender/protocol";

export function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs === null || latencyMs === undefined ? "—" : `${String(latencyMs)} мс`;
}

export function roleLabel(role: CrewRole): string {
  return role === "pilot" ? "Пилот" : role === "gunner" ? "Наводчик" : "Оператор щита";
}

/**
 * The maintenance announcement both clients show. One function so the two
 * cannot drift into telling a crew different things about the same window.
 *
 * The zero case is not "no time left" but "the window is open now": the server
 * keeps the flag after the countdown runs out, and a run in progress is still
 * allowed to finish.
 */
export function formatMaintenanceCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) {
    return "Технические работы начинаются. Новые забеги не запускаются, текущий можно доиграть.";
  }
  const minutes = Math.ceil(secondsRemaining / 60);
  if (minutes >= 2) {
    return `Технические работы через ${String(minutes)} мин. Новые забеги не запускаются.`;
  }
  return `Технические работы меньше чем через минуту. Новые забеги не запускаются.`;
}
