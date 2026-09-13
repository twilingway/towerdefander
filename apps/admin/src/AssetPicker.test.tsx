import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssetPicker } from "./AssetPicker.js";

const ignore = () => undefined;

describe("AssetPicker thumbnails", () => {
  it("shows a sprite by its picture, not by geometry", () => {
    const markup = renderToStaticMarkup(
      <AssetPicker label="Корпус" value="sprite-player" categories={["ship"]} onChange={ignore} />
    );

    expect(markup).toContain("sprite-player.webp");
    expect(markup).toContain("Авангард (арт)");
  });

  it("shows the chosen look in the collapsed row, not only its name", () => {
    const chosen = renderToStaticMarkup(
      <AssetPicker label="Корпус" value="ship-dart" categories={["ship"]} onChange={ignore} />
    );
    const unset = renderToStaticMarkup(
      <AssetPicker label="Корпус" value={null} categories={["ship"]} allowNone onChange={ignore} />
    );

    expect(chosen).toContain("assets__current-thumb");
    expect(unset).not.toContain("assets__current-thumb");
  });

  it("crops the asteroid sheet to one rock", () => {
    const markup = renderToStaticMarkup(
      <AssetPicker
        label="Астероид: внешний вид"
        value={null}
        categories={["asteroid"]}
        allowNone
        onChange={ignore}
      />
    );

    // The sheet is four cells wide; the thumbnail's viewport is one cell, so
    // only the first rock can show through it.
    expect(markup).toContain("sprite-asteroids.webp");
    expect(markup).toContain('viewBox="0 0 256 256"');
    expect(markup).toContain('width="1024"');
  });

  it("keeps drawing a silhouette as geometry", () => {
    const markup = renderToStaticMarkup(
      <AssetPicker label="Силуэт" value="ship-dart" categories={["drone"]} onChange={ignore} />
    );

    expect(markup).toContain("<polygon");
  });
});
