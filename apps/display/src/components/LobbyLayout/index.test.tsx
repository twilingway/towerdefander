import { renderToStaticMarkup } from "react-dom/server";
import type { CrewSize } from "@spaceship-defender/protocol";
import { describe, expect, it } from "vitest";

import { createPreviewRoomView } from "../../previewMode.js";
import { LobbyLayout } from "./index.js";

function seatCount(html: string): number {
  return html.match(/class="player-slot/g)?.length ?? 0;
}

function markup(crewSize: CrewSize): string {
  const preview = createPreviewRoomView("lobby");
  return renderToStaticMarkup(
    <LobbyLayout
      view={{ ...preview, crewSize, players: preview.players.slice(0, crewSize) }}
      joinUrl="https://example.test/join"
    />
  );
}

describe("LobbyLayout", () => {
  it("offers the fullscreen switch where the room is set up", () => {
    // Rendered without a document, so the host reads as unsupported and the
    // button is absent rather than dead: what this pins is that the lobby asks
    // for it at all, and that it degrades to nothing.
    expect(markup(3)).not.toContain('data-testid="fullscreen-button"');
  });

  it("counts the seats a solo room actually has and names the autopilot", () => {
    const html = markup(1);

    expect(seatCount(html)).toBe(1);
    expect(html).toContain("1/1");
    expect(html).toContain("Подключите контроллер");
    expect(html).toContain("Под автопилотом");
  });

  it("shows two seats for a duo and still hands the shield to the autopilot", () => {
    const html = markup(2);

    expect(seatCount(html)).toBe(2);
    expect(html).toContain("2/2");
    expect(html).toContain("Подключите два контроллера");
    expect(html).toContain("Под автопилотом");
  });

  it("keeps the full crew unchanged", () => {
    const html = markup(3);

    expect(seatCount(html)).toBe(3);
    expect(html).toContain("3/3");
    expect(html).toContain("Подключите три контроллера");
    expect(html).not.toContain("Под автопилотом");
  });
});
