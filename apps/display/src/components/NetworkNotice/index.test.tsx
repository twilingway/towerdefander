import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NetworkNotice } from "./index.js";

describe("NetworkNotice", () => {
  it("says what went wrong and what is still open, in the screen's own terms", () => {
    expect(renderToStaticMarkup(<NetworkNotice closure="unreachable" screen="start" />)).toContain(
      "Сервер игры не отвечает, доступна только кампания."
    );
    expect(renderToStaticMarkup(<NetworkNotice closure="offline" screen="campaign" />)).toContain(
      "Нет подключения к интернету, играть можно только на этом устройстве."
    );
  });

  it("offers the update only when the server is on a newer protocol", () => {
    expect(renderToStaticMarkup(<NetworkNotice closure="outdated" screen="start" />)).toContain(
      'data-testid="network-update"'
    );
    expect(
      renderToStaticMarkup(<NetworkNotice closure="unreachable" screen="start" />)
    ).not.toContain('data-testid="network-update"');
  });
});
