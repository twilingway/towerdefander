import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { LobbyLayout } from "./index.js";

function view(overrides: Partial<DisplayRoomView> = {}): DisplayRoomView {
  return {
    roomId: "ROOM123",
    phase: "lobby",
    runNumber: 0,
    crewSize: 1,
    shipArchetypeId: "guardian",
    maintenanceActive: false,
    maintenanceSecondsRemaining: 0,
    displayConnected: true,
    displayLatencyMs: 12,
    players: [
      {
        playerId: "solo-1",
        playerName: "Ada",
        role: "pilot",
        ready: false,
        connected: true,
        latencyMs: 20
      }
    ],
    game: null,
    ...overrides
  } as unknown as DisplayRoomView;
}

describe("LobbyLayout", () => {
  it("offers the code to scan when somebody else is joining", () => {
    const markup = renderToStaticMarkup(
      <LobbyLayout view={view({ crewSize: 3 })} joinUrl="http://example/join" />
    );

    expect(markup).toContain("http://example/join");
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("cockpit-ready");
  });

  it("drops the code when the screen is the pilot, because nobody can scan it", () => {
    const markup = renderToStaticMarkup(
      <LobbyLayout
        view={view()}
        joinUrl="http://example/join"
        cockpit={{ ready: false, onReady: vi.fn() }}
      />
    );

    // The whole point: there is no second device, so no code and no link.
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("http://example/join");
    expect(markup).toContain('data-testid="cockpit-ready"');
    expect(markup).toContain("Готов");
  });

  it("stops offering the button once the seat is ready", () => {
    const markup = renderToStaticMarkup(
      <LobbyLayout
        view={view()}
        joinUrl="http://example/join"
        cockpit={{ ready: true, onReady: vi.fn() }}
      />
    );

    expect(markup).toContain("Ждём старта…");
    expect(markup).toContain("disabled");
  });

  it("still shows the roster, so the seat can be seen to be taken", () => {
    const markup = renderToStaticMarkup(
      <LobbyLayout
        view={view()}
        joinUrl="http://example/join"
        cockpit={{ ready: false, onReady: vi.fn() }}
      />
    );

    expect(markup).toContain("Ada");
    expect(markup).toContain("Экипаж");
  });
});
