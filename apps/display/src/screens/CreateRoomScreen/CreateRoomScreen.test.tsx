import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CreateRoomScreen } from "./index.js";

const base = {
  status: "idle" as const,
  error: "",
  visibleDemo: false,
  sharedScreen: false,
  allowStartWave: false,
  initialStartWave: 1,
  ships: [],
  defaultShipId: undefined,
  initialPlace: "device" as const,
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

  it("switches the shared screen off unless the address opens it", () => {
    const tile = /aria-label="Общий экран"[^>]*disabled=""/;
    const closed = renderToStaticMarkup(<CreateRoomScreen {...base} maintenance={undefined} />);
    const open = renderToStaticMarkup(
      <CreateRoomScreen {...base} sharedScreen maintenance={undefined} />
    );
    expect(closed).toMatch(tile);
    expect(open).not.toMatch(tile);
  });

  it("offers the device, the server and the shared screen as three places", () => {
    const markup = renderToStaticMarkup(<CreateRoomScreen {...base} maintenance={undefined} />);
    expect(markup).toMatch(/aria-label="Соло"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/aria-label="Через сервер"[^>]*aria-pressed="false"/);
    expect(markup).toContain('aria-label="Общий экран"');
    // Harnesses find the device tile by a substring of its name, so no other
    // tile may carry that word.
    expect(markup.match(/aria-label="[^"]*[Сс]оло[^"]*"/g)).toHaveLength(1);
  });

  it("arrives on the server tile when the address asks for it", () => {
    const markup = renderToStaticMarkup(
      <CreateRoomScreen {...base} initialPlace="server" maintenance={undefined} />
    );
    expect(markup).toMatch(/aria-label="Через сервер"[^>]*aria-pressed="true"/);
    expect(markup).toMatch(/aria-label="Соло"[^>]*aria-pressed="false"/);
  });
});
