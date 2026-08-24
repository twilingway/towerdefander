import type { PublicTeamUpgradeView, PublicUpgradeVotes } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ControllerApp,
  PreviewControls,
  RunResultPanel,
  TeamUpgradePanel,
  createActionId,
  toServerError
} from "./App.js";

const emptyVotes: PublicUpgradeVotes = { pilot: null, gunner: null, shield: null };
const teamUpgrade: PublicTeamUpgradeView = {
  offer: {
    offerId: "offer-w2",
    waveNumber: 2,
    cards: [
      { upgradeId: "pilot_speed", role: "pilot", label: "Скорость +10%", value: 0.1, price: 5 },
      { upgradeId: "gunner_damage", role: "gunner", label: "Урон +15%", value: 0.15, price: 5 },
      { upgradeId: "shield_capacity", role: "shield", label: "Ёмкость +20", value: 20, price: 5 }
    ]
  },
  votes: {
    pilot: { role: "pilot", upgradeId: "gunner_damage", revision: 2 },
    gunner: { role: "gunner", upgradeId: "gunner_damage", revision: 1 },
    shield: null
  },
  selection: null
};

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

  it("renders the shared offer with team credits and public votes", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradePanel
        role="pilot"
        teamUpgrade={teamUpgrade}
        credits={7}
        phaseTicksRemaining={600}
        reconnecting={false}
        connectionEpoch={0}
        errorEpoch={0}
        onVote={() => undefined}
      />
    );

    expect(markup).toContain("Передышка · 30.0 с");
    expect(markup).toContain("Кредиты экипажа");
    expect(markup).toContain("Голоса: Пилот, Наводчик");
    expect(markup).toContain("Голосов нет");
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(1);
    expect(markup).not.toContain("Кредитов не хватает");
  });

  it("warns the crew when the shared balance cannot pay for the offer", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradePanel
        role="shield"
        teamUpgrade={teamUpgrade}
        credits={4}
        phaseTicksRemaining={200}
        reconnecting={false}
        connectionEpoch={0}
        errorEpoch={0}
        onVote={() => undefined}
      />
    );

    expect(markup).toContain("Кредитов не хватает");
    expect(markup).not.toContain('aria-pressed="true"');
  });

  it("waits for the authoritative offer before showing any card", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradePanel
        role="gunner"
        teamUpgrade={{ offer: null, votes: emptyVotes, selection: null }}
        credits={0}
        phaseTicksRemaining={600}
        reconnecting={false}
        connectionEpoch={0}
        errorEpoch={0}
        onVote={() => undefined}
      />
    );

    expect(markup).toContain("Подготавливаем улучшения…");
    expect(markup).not.toContain("upgrade-card");
  });

  it("explains rejection of a delayed command from an earlier run", () => {
    expect(toServerError("stale_run", "fallback")).toContain("завершённому бою");
  });
});

describe("layout preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the play screen from a fixture instead of the join form", () => {
    vi.stubGlobal("window", { location: { search: "?preview=1" } });

    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain("Превью верстки");
    expect(markup).toContain("Комната PREVIEW");
    expect(markup).not.toContain('name="roomCode"');
  });

  it("keeps the join form without the preview parameter", () => {
    vi.stubGlobal("window", { location: { search: "" } });

    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain('name="roomCode"');
    expect(markup).not.toContain("Превью верстки");
  });

  it("marks the selected role and phase in the preview switcher", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        role="shield"
        phase="intermission"
        onRoleChange={() => undefined}
        onPhaseChange={() => undefined}
      />
    );

    expect(markup).toContain("Оператор щита");
    expect(markup).toContain("Передышка");
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(2);
  });
});
