import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { ControllerApp } from "./App.js";

describe("ControllerApp", () => {
  it("renders the browser join form", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ControllerApp />
      </MemoryRouter>
    );

    expect(markup).toContain("SpaceShip Defender");
    expect(markup).toContain("Контроллер экипажа");
    expect(markup).toContain('name="roomCode"');
    expect(markup).toContain('name="playerName"');
    expect(markup).toContain("Подключиться");
  });
});
