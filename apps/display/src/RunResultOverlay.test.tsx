import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunResultOverlay } from "./RunResultOverlay.js";

describe("RunResultOverlay", () => {
  it.each([
    ["defeat" as const, "Летающий замок уничтожен"],
    ["victory" as const, "Победа!"]
  ])("renders the %s result with final statistics", (outcome, title) => {
    const markup = renderToStaticMarkup(
      <RunResultOverlay
        outcome={outcome}
        waveNumber={7}
        score={12_340}
        readyCount={2}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain(title);
    expect(markup).toContain("Волна 7");
    expect(markup).toContain("Итоговый счёт: 12340");
    expect(markup).toContain("Готовы сыграть ещё: 2/3");
    expect(markup).toContain("Закрыть комнату");
  });

  it("disables the close action while the consented leave is pending", () => {
    const markup = renderToStaticMarkup(
      <RunResultOverlay
        outcome="defeat"
        waveNumber={1}
        score={0}
        readyCount={0}
        closing
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Закрываем комнату…");
  });
});
