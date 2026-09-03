import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RotateNotice } from "./index.js";

describe("RotateNotice", () => {
  it("asks for landscape and says why", () => {
    const markup = renderToStaticMarkup(<RotateNotice />);
    expect(markup).toContain('data-testid="rotate-notice"');
    expect(markup).toContain("Поверните устройство");
    // An alert, because it replaces the battlefield rather than decorating it.
    expect(markup).toContain('role="alert"');
  });
});
