import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisplayApp, PreviewControls } from "./App.js";

describe("DisplayApp", () => {
  it("renders the shared-screen room creation state", () => {
    const markup = renderToStaticMarkup(<DisplayApp />);

    expect(markup).toContain("SpaceShip Defender");
    expect(markup).toContain("Создать комнату");
    expect(markup).toContain("движение, орудия и щит");
    expect(markup).not.toContain('data-testid="visible-demo-overlay"');
  });
});

describe("layout preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the battle screen from a fixture instead of the room creation state", () => {
    vi.stubGlobal("window", { location: { search: "?preview=1" } });

    const markup = renderToStaticMarkup(<DisplayApp />);

    expect(markup).toContain('data-testid="preview-controls"');
    expect(markup).toContain("PREVIEW");
    expect(markup).toContain('data-testid="spaceship-world"');
    expect(markup).not.toContain("Создать комнату");
  });

  it("keeps the room creation state without the preview parameter", () => {
    vi.stubGlobal("window", { location: { search: "" } });

    const markup = renderToStaticMarkup(<DisplayApp />);

    expect(markup).toContain("Создать комнату");
    expect(markup).not.toContain('data-testid="preview-controls"');
  });

  it("marks the selected phase in the preview switcher", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls phase="result" onPhaseChange={() => undefined} />
    );

    expect(markup).toContain("Итог");
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(1);
  });
});
