import type { PublicTeamUpgradeView, PublicUpgradeVotes } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamUpgradePanel } from "./index.js";

const emptyVotes: PublicUpgradeVotes = { pilot: null, gunner: null, shield: null };
const teamUpgrade: PublicTeamUpgradeView = {
  offer: {
    offerId: "offer-w2",
    waveNumber: 2,
    tier: 6,
    cards: [
      {
        upgradeId: "afterburner",
        role: "pilot",
        label: "Форсаж",
        effects: [{ target: "spaceshipSpeedPerSecond", op: "percent", value: 0.14 }],
        price: 5
      },
      {
        upgradeId: "turretDrive",
        role: "gunner",
        label: "Привод башни",
        effects: [{ target: "turretMaxAngularSpeedPerSecond", op: "percent", value: 0.25 }],
        price: 5
      },
      {
        upgradeId: "capacitor2",
        role: "shield",
        label: "Батарея",
        effects: [{ target: "shieldCapacity", op: "add", value: 40 }],
        price: 5
      }
    ]
  },
  votes: {
    pilot: { role: "pilot", upgradeId: "turretDrive", revision: 2 },
    gunner: { role: "gunner", upgradeId: "turretDrive", revision: 1 },
    shield: null
  },
  selection: null
};

describe("TeamUpgradePanel", () => {
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
});
