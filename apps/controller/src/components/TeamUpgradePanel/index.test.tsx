import type { PublicTeamUpgradeView, PublicUpgradeVotes } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamUpgradePanel } from "./index.js";

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
