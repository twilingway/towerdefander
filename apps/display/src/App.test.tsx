import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisplayApp } from "./App.js";

describe("DisplayApp", () => {
  it("renders the shared-screen room creation state", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DisplayApp />
      </MemoryRouter>
    );

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

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DisplayApp />
      </MemoryRouter>
    );

    expect(markup).toContain('data-testid="preview-controls"');
    expect(markup).toContain("PREVIEW");
    expect(markup).toContain('data-testid="spaceship-world"');
    expect(markup).not.toContain("Создать комнату");
  });

  it("counts only the rocks that pay credits next to the score", () => {
    vi.stubGlobal("window", { location: { search: "?preview=1" } });

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DisplayApp />
      </MemoryRouter>
    );

    // The fixture holds one wave rock and one ambient one; only the first pays.
    // That the radar still shows both is now a question for the painter's own
    // test: the dial is a canvas, and a picture has no markup to search.
    expect(markup).toContain('data-testid="hud-field-counts"');
    expect(markup).toContain("Камни 1");
  });

  it("keeps the room creation state without the preview parameter", () => {
    vi.stubGlobal("window", { location: { search: "" } });

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DisplayApp />
      </MemoryRouter>
    );

    expect(markup).toContain("Создать комнату");
    expect(markup).not.toContain('data-testid="preview-controls"');
  });
});
