import type Phaser from "phaser";

/**
 * A drawing turned into a texture, once per key.
 *
 * A `Graphics` object is re-walked, re-tessellated and re-batched on every
 * frame it is visible, however long ago it was drawn - a profile of a throttled
 * fight put that walk and its batcher at two thirds of the main thread. An
 * `Image` of the same drawing is four vertices. So anything with a fixed shape
 * is baked here and then only moved, turned and scaled.
 *
 * The canvas is translated to the middle first, so the drawing's own origin
 * ends up at the texture's centre and the image's default origin lines up with
 * what the graphics version would have shown.
 */
/**
 * A drawing baked at its own size, origin at the top-left corner.
 *
 * The square bake above centres what it draws, which is right for a hull and
 * wrong for a bar: a padded square cannot be scaled to show a fraction of
 * itself without the padding scaling too.
 */
export function bakeRect(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
): string {
  if (scene.textures.exists(key)) return key;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(graphics);
  graphics.generateTexture(key, Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
  graphics.destroy();
  return key;
}

export function bakeShape(
  scene: Phaser.Scene,
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
): string {
  if (scene.textures.exists(key)) return key;
  const size = Math.max(2, Math.ceil(half * 2));
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.translateCanvas(size / 2, size / 2);
  draw(graphics);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
  return key;
}
