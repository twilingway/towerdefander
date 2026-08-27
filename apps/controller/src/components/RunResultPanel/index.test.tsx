import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunResultPanel } from "./index.js";

describe("RunResultPanel", () => {
  it("renders authoritative rematch readiness for defeat", () => {
    const players = [
      {
        playerId: "pilot-1",
        playerName: "Alex",
        role: "pilot" as const,
        ready: true,
        connected: true,
        latencyMs: 20
      },
      {
        playerId: "gunner-1",
        playerName: "Sam",
        role: "gunner" as const,
        ready: false,
        connected: true,
        latencyMs: 30
      },
      {
        playerId: "shield-1",
        playerName: "Lee",
        role: "shield" as const,
        ready: false,
        connected: true,
        latencyMs: 40
      }
    ] as const;
    const markup = renderToStaticMarkup(
      <RunResultPanel
        outcome="defeat"
        defeatReason="spaceship_destroyed"
        waveNumber={4}
        score={900}
        players={players}
        currentPlayer={players[0]}
        reconnecting={false}
        onRematch={() => undefined}
      />
    );

    expect(markup).toContain("Корабль уничтожен");
    expect(markup).toContain("Готовы к новому бою: 1 / 3");
    expect(markup).toContain("Готов — ждём экипаж");
    expect(markup).toContain("disabled");
  });

  it("renders a future victory result and an available rematch action", () => {
    const player = {
      playerId: "pilot-1",
      playerName: "Alex",
      role: "pilot" as const,
      ready: false,
      connected: true,
      latencyMs: 20
    };
    const markup = renderToStaticMarkup(
      <RunResultPanel
        outcome="victory"
        defeatReason={null}
        waveNumber={8}
        score={3200}
        players={[player]}
        currentPlayer={player}
        reconnecting={false}
        onRematch={() => undefined}
      />
    );

    expect(markup).toContain("Победа экипажа");
    expect(markup).toContain("Играть ещё");
    expect(markup).not.toContain("disabled");
  });

  it("renders an authoritative wave-timeout defeat", () => {
    const player = {
      playerId: "pilot-1",
      playerName: "Alex",
      role: "pilot" as const,
      ready: false,
      connected: true,
      latencyMs: 20
    };
    const markup = renderToStaticMarkup(
      <RunResultPanel
        outcome="defeat"
        defeatReason="wave_timeout"
        waveNumber={9}
        score={6400}
        players={[player]}
        currentPlayer={player}
        reconnecting={false}
        onRematch={() => undefined}
      />
    );

    expect(markup).toContain("Время волны истекло");
    expect(markup).toContain("Играть ещё");
  });
});
