import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ControllerApp, RunResultPanel, createActionId, toServerError } from "./App.js";

describe("ControllerApp", () => {
  it("renders the browser join form", () => {
    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain("SpaceShip Defender");
    expect(markup).toContain("Контроллер экипажа");
    expect(markup).toContain('name="roomCode"');
    expect(markup).toContain('name="playerName"');
    expect(markup).toContain("Подключиться");
  });

  it("creates a UUID action identity for an exact upgrade command", () => {
    expect(createActionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });

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

  it("explains rejection of a delayed command from an earlier run", () => {
    expect(toServerError("stale_run", "fallback")).toContain("завершённому бою");
  });
});
