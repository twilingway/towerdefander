import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunResultOverlay } from "./RunResultOverlay.js";

describe("RunResultOverlay", () => {
  it.each([
    ["defeat" as const, "Корабль уничтожен"],
    ["victory" as const, "Победа!"]
  ])("renders the %s result with final statistics", (outcome, title) => {
    const markup = renderToStaticMarkup(
      <RunResultOverlay
        outcome={outcome}
        defeatReason={outcome === "defeat" ? "spaceship_destroyed" : null}
        waveNumber={7}
        score={12_340}
        readyCount={2}
        crewSize={3}
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
        defeatReason="spaceship_destroyed"
        waveNumber={1}
        score={0}
        readyCount={0}
        crewSize={3}
        closing
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("Закрываем комнату…");
  });

  it("explains defeat caused by an expired wave countdown", () => {
    const markup = renderToStaticMarkup(
      <RunResultOverlay
        outcome="defeat"
        defeatReason="wave_timeout"
        waveNumber={5}
        score={1500}
        readyCount={0}
        crewSize={3}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("Время волны истекло");
    expect(markup).not.toContain("Корабль уничтожен");
  });

  it("offers a rematch to a screen that is also the pilot", () => {
    const markup = renderToStaticMarkup(
      <RunResultOverlay
        outcome="defeat"
        defeatReason="spaceship_destroyed"
        waveNumber={4}
        score={120}
        readyCount={0}
        crewSize={1}
        closing={false}
        onClose={vi.fn()}
        cockpit={{ ready: false, onReady: vi.fn() }}
      />
    );

    // Without it the only way out of a finished solo run was to close the room.
    expect(markup).toContain('data-testid="cockpit-rematch"');
    expect(markup).toContain("Играть ещё");
  });

  it("counts the seats there actually are", () => {
    const solo = renderToStaticMarkup(
      <RunResultOverlay
        outcome="victory"
        defeatReason={null}
        waveNumber={9}
        score={900}
        readyCount={0}
        crewSize={1}
        closing={false}
        onClose={vi.fn()}
      />
    );

    expect(solo).toContain("0/1");
    // ...and stops telling one player to wait for two more.
    expect(solo).not.toContain("все три игрока");
  });
});
