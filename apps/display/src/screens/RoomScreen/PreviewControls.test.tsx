import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PreviewControls } from "./PreviewControls.js";

describe("PreviewControls", () => {
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
