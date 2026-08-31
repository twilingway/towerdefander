import type { PublicTeamUpgradeView } from "@spaceship-defender/protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";

const teamUpgrade: PublicTeamUpgradeView = {
  offer: {
    offerId: "offer-w3",
    waveNumber: 3,
    tier: 6,
    cards: [
      {
        upgradeId: "hullPlating2",
        role: "pilot",
        label: "Композитный корпус",
        effects: [{ target: "spaceshipMaxHp", op: "add", value: 60 }],
        price: 5
      },
      {
        upgradeId: "heavyRounds",
        role: "gunner",
        label: "Тяжёлые снаряды",
        effects: [{ target: "friendlyProjectileDamage", op: "percent", value: 0.18 }],
        price: 5
      },
      {
        upgradeId: "wideArc",
        role: "shield",
        label: "Широкий сектор",
        effects: [{ target: "shieldArcRadians", op: "add", value: Math.PI / 9 }],
        price: 5
      }
    ]
  },
  votes: {
    pilot: { role: "pilot", upgradeId: "wideArc", revision: 1 },
    gunner: null,
    shield: { role: "shield", upgradeId: "wideArc", revision: 4 }
  },
  selection: null
};

describe("TeamUpgradeOverlay", () => {
  it("publishes score, shared credits and every public vote", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradeOverlay
        teamUpgrade={teamUpgrade}
        credits={9}
        score={480}
        waveNumber={3}
        phaseTicksRemaining={600}
        purchasedModules={[
          "hullPlating1",
          "thrusters1",
          "ammoFeed1",
          "gyroscopes1",
          "noseCooling1"
        ]}
      />
    );

    expect(markup).toContain("Волна 3 завершена");
    expect(markup).toContain("Следующая волна через 30.0 с");
    expect(markup).toContain("Очки экипажа: 480");
    expect(markup).toContain("кредиты: 9");
    expect(markup).toContain("цена улучшения: 5");
    expect(markup).toContain("Голоса: Пилот, Оператор щита");
    expect(markup).toContain("Голосов нет");
    expect(markup.match(/intermission-card--voted/gu)).toHaveLength(1);
  });

  it("warns the crew when the shared balance cannot pay for the offer", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradeOverlay
        teamUpgrade={teamUpgrade}
        credits={2}
        score={40}
        waveNumber={3}
        phaseTicksRemaining={120}
        purchasedModules={[
          "hullPlating1",
          "thrusters1",
          "ammoFeed1",
          "gyroscopes1",
          "noseCooling1"
        ]}
      />
    );

    expect(markup).toContain("Кредитов не хватает");
  });

  it("waits for the authoritative offer before listing cards", () => {
    const markup = renderToStaticMarkup(
      <TeamUpgradeOverlay
        teamUpgrade={{
          offer: null,
          votes: { pilot: null, gunner: null, shield: null },
          selection: null
        }}
        credits={0}
        score={0}
        waveNumber={1}
        phaseTicksRemaining={600}
        purchasedModules={[
          "hullPlating1",
          "thrusters1",
          "ammoFeed1",
          "gyroscopes1",
          "noseCooling1"
        ]}
      />
    );

    expect(markup).toContain("Сервер готовит карточки…");
    expect(markup).not.toContain("intermission-card");
  });
});
