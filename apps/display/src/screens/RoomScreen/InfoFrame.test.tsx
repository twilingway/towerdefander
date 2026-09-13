import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InfoFrame } from "./InfoFrame.js";

describe("InfoFrame", () => {
  it("puts each row's number in its capsule, with the caption and the small line", () => {
    const markup = renderToStaticMarkup(
      <InfoFrame
        frameUrl="info.webp"
        rows={[
          { label: "Волна", value: 5, detail: "бой" },
          {
            label: "Счёт",
            value: 240,
            detail: "Враги 3 · Ракеты 1 · Камни 2",
            detailTestId: "hud-field-counts"
          },
          { label: "Кредиты", value: 6, detail: "в этой волне улучшений нет" }
        ]}
      />
    );

    expect(markup.match(/class="info-frame__row"/g)?.length).toBe(3);
    expect(markup).toContain(">Волна<");
    expect(markup).toContain("<strong>240</strong>");
    // The field counts keep the id the classic header gives them.
    expect(markup).toContain('data-testid="hud-field-counts">Враги 3 · Ракеты 1 · Камни 2<');
  });

  it("keeps the match's ids on its kills and its place", () => {
    const markup = renderToStaticMarkup(
      <InfoFrame
        frameUrl="info.webp"
        rows={[
          { label: "Живых", value: 12 },
          { label: "Сбитые", value: 3, valueTestId: "arena-hud-kills" },
          { label: "Место", value: 12, valueTestId: "arena-hud-place" }
        ]}
      />
    );

    expect(markup).toContain('<strong data-testid="arena-hud-kills">3</strong>');
    expect(markup).toContain('<strong data-testid="arena-hud-place">12</strong>');
  });

  it("draws its numbers without a picture when the build has none", () => {
    const markup = renderToStaticMarkup(
      <InfoFrame
        frameUrl={undefined}
        rows={[
          { label: "Живых", value: 1 },
          { label: "Сбитые", value: 0 },
          { label: "Место", value: 1 }
        ]}
      />
    );

    expect(markup).not.toContain("<img");
    expect(markup).toContain(">Место<");
  });
});
