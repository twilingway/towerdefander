import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayApp } from "./App.js";

describe("DisplayApp", () => {
  it("renders the shared-screen room creation state", () => {
    const markup = renderToStaticMarkup(<DisplayApp />);

    expect(markup).toContain("SpaceShip Defender");
    expect(markup).toContain("Создать комнату");
    expect(markup).toContain("движение, орудия и щит");
    expect(markup).not.toContain('data-testid="visible-demo-overlay"');
  });
});
