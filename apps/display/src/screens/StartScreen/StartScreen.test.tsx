import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StartScreen } from "./index.js";

const ARENA_TILE = /aria-label="Арена: Талос"[^>]*/;

describe("StartScreen", () => {
  /*
   * The arena has a training match on this device now, so no closure of the
   * network closes the mode: its own screen dims the server places instead.
   */
  it("keeps the arena tile open with no network, and says why the network is out", () => {
    const markup = renderToStaticMarkup(
      <StartScreen maintenance={undefined} serverReach="offline" onPick={() => undefined} />
    );

    expect(markup).toContain("Нет подключения к интернету");
    expect(ARENA_TILE.exec(markup)?.[0]).not.toContain('disabled=""');
  });

  it("keeps the arena tile open during a maintenance window", () => {
    const markup = renderToStaticMarkup(
      <StartScreen
        maintenance={{ active: true, secondsRemaining: 900 }}
        serverReach="online"
        onPick={() => undefined}
      />
    );

    expect(markup).toContain("maintenance-notice--prominent");
    expect(ARENA_TILE.exec(markup)?.[0]).not.toContain('disabled=""');
  });
});
