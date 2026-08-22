import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ControllerApp, createActionId } from "./App.js";

describe("ControllerApp", () => {
  it("renders the browser join form", () => {
    const markup = renderToStaticMarkup(<ControllerApp />);

    expect(markup).toContain("Flying Castle");
    expect(markup).toContain("Контроллер экипажа");
    expect(markup).toContain('name="roomCode"');
    expect(markup).toContain('name="playerName"');
    expect(markup).toContain("Подключиться");
  });

  it("creates a UUID action identity for an exact upgrade command", () => {
    expect(createActionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });
});
