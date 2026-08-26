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

  it("counts only the rocks that pay credits next to the score", () => {
    vi.stubGlobal("window", { location: { search: "?preview=1" } });

    const markup = renderToStaticMarkup(<DisplayApp />);

    // The fixture holds one wave rock and one ambient one; only the first pays.
    expect(markup).toContain('data-testid="hud-field-counts"');
    expect(markup).toContain("Камни 1");
    expect(markup).toContain('data-entity-id="preview-asteroid-2"');
  });

  it("keeps the room creation state without the preview parameter", () => {
    vi.stubGlobal("window", { location: { search: "" } });

    const markup = renderToStaticMarkup(<DisplayApp />);

    expect(markup).toContain("Создать комнату");
    expect(markup).not.toContain('data-testid="preview-controls"');
  });

  it("marks the selected phase in the preview switcher", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        phase="result"
        onPhaseChange={() => undefined}
        cameraViewWidth={1600}
        onCameraViewWidthChange={() => undefined}
      />
    );

    expect(markup).toContain("Итог");
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(1);
  });

  it("opens expanded and offers a collapse control", () => {
    const markup = renderToStaticMarkup(
      <PreviewControls
        phase="combat"
        onPhaseChange={() => undefined}
        cameraViewWidth={1600}
        onCameraViewWidthChange={() => undefined}
      />
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Свернуть панель превью");
    expect(markup).not.toContain("preview-controls--collapsed");
  });
});
