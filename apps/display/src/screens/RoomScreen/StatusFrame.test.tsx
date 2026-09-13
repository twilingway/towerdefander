import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatusFrame } from "./StatusFrame.js";

describe("StatusFrame", () => {
  it("puts a cell over every painted slot, eleven of them on the cannon", () => {
    const markup = renderToStaticMarkup(<StatusFrame lit={[0, 0, 0, 0]} frameUrl="frame.webp" />);

    expect(markup.match(/<i /g)?.length).toBe(41);
    expect(markup).not.toContain("is-lit");
  });

  it("lights exactly the counted cells of each bar", () => {
    const markup = renderToStaticMarkup(<StatusFrame lit={[11, 5, 0, 3]} frameUrl="frame.webp" />);

    expect(markup.match(/class="is-lit"/g)?.length).toBe(19);
    expect(markup).toContain('data-bar="cannon" data-lit="11"');
    expect(markup).toContain('data-bar="hull" data-lit="5"');
  });

  it("has no pause button", () => {
    const markup = renderToStaticMarkup(<StatusFrame lit={[0, 0, 0, 0]} frameUrl="frame.webp" />);

    expect(markup).not.toContain("<button");
  });
});
