import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ControllerApp } from "./App.js";

describe("ControllerApp", () => {
  it("renders the browser join form", () => {
    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain("Войти в комнату");
    expect(markup).toContain('name="roomCode"');
    expect(markup).toContain('name="playerName"');
    expect(markup).toContain("Подключиться");
  });
});
