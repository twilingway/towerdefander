import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CreateRoomScreen } from "./index.js";

const base = {
  status: "idle" as const,
  error: "",
  visibleDemo: false,
  allowStartWave: false,
  initialStartWave: 1,
  ships: [],
  defaultShipId: undefined,
  onBack: () => undefined,
  onCreate: () => undefined
};

describe("CreateRoomScreen", () => {
  it("offers the controls when the server is taking rooms", () => {
    const markup = renderToStaticMarkup(<CreateRoomScreen {...base} maintenance={undefined} />);
    expect(markup).toContain("В бой");
    expect(markup).toContain("Где играете");
    expect(markup).not.toContain("maintenance-notice");
  });

  it("takes the controls away while a window is announced", () => {
    // Every one of them would be a different way of being told no: the server
    // refuses the room, so a crew size and a create button promise something
    // that cannot happen.
    const markup = renderToStaticMarkup(
      <CreateRoomScreen {...base} maintenance={{ active: true, secondsRemaining: 900 }} />
    );
    expect(markup).not.toContain("В бой");
    expect(markup).not.toContain("Где играете");
    expect(markup).toContain("Технические работы через 15 мин");
    expect(markup).toContain("maintenance-notice--prominent");
    // The game still says what it is; only the promises are gone.
    expect(markup).toContain("SpaceShip Defender");
  });
});
