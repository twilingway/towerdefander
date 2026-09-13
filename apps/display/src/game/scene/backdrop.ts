import type Phaser from "phaser";
import { createSeededRandom } from "@spaceship-defender/game-core";
import type { BackdropImage, DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { getBackdropArt } from "@spaceship-defender/sprite-assets";

import type { BakeShape } from "../catalogTexture.js";
import type { Point } from "../spaceshipViewModel.js";
import {
  STAR_LAYERS,
  backdropPictureScale,
  backdropShift,
  getBackgroundCoverRect,
  starAlpha,
  starPosition,
  type BackgroundCoverRect
} from "../viewport.js";

/** Under the arena floor, which sits at depth 0, and everything that stands on it. */
const PICTURE_DEPTH = -20;
/** The far stars just over the picture, and each nearer layer a step over the one behind it. */
const STAR_DEPTH = -19;
const STAR_DEPTH_STEP = 0.1;
/** One fixed seed, so every screen in the room draws the same sky. */
const STAR_SEED = 20_260_913;

export function backdropTextureKey(image: Exclude<BackdropImage, "none">): string {
  return `backdrop:${image}`;
}

/** Queues the run's picture. `none` loads nothing, and neither does a picture this build lacks. */
export function preloadBackdrop(scene: Phaser.Scene, image: BackdropImage): void {
  if (image === "none") return;
  const key = backdropTextureKey(image);
  const art = getBackdropArt(image);
  if (art === undefined || scene.textures.exists(key)) return;
  scene.load.image(key, art.url);
}

interface Star {
  readonly bob: Phaser.GameObjects.Bob;
  readonly home: { readonly u: number; readonly v: number; readonly depth: number };
  readonly phase: number;
}

/** One layer of stars: a blitter of one baked dot, and the stars stamped from it. */
interface StarField {
  readonly blitter: Phaser.GameObjects.Blitter;
  readonly stars: readonly Star[];
}

/**
 * The sky: one picture and three layers of stars, all fixed to the screen and under the arena.
 *
 * Nothing here is drawn per frame. The picture is an image of a loaded texture and each layer of
 * stars is bobs of one baked dot in its own blitter - a bob has no scale of its own, so a layer's
 * dot size is its texture. A frame only moves them and sets how bright the stars are, the rule
 * every other layer of this scene already follows. The sky before the picture was four tiled
 * layers and cost weak phones their frame rate; this one is four batches of fixed textures.
 *
 * Depth reads from pace: the nebula follows the camera slowest, and every layer of stars in front
 * of it faster than the one behind.
 */
export class BackdropLayer {
  private readonly picture: Phaser.GameObjects.Image | undefined;
  private readonly fields: readonly StarField[];
  private readonly twinkle: boolean;
  private layoutKey = "";
  private cover: BackgroundCoverRect = { x: 0, y: 0, width: 1, height: 1 };
  private marginX = 0;
  private marginY = 0;

  constructor(scene: Phaser.Scene, image: BackdropImage, bake: BakeShape) {
    const key = image === "none" ? undefined : backdropTextureKey(image);
    // A picture that failed to load leaves the stars on their own rather than a green box.
    this.picture =
      key !== undefined && scene.textures.exists(key)
        ? scene.add.image(0, 0, key).setScrollFactor(0).setDepth(PICTURE_DEPTH)
        : undefined;
    const random = createSeededRandom(STAR_SEED);
    this.fields =
      image === "none"
        ? []
        : STAR_LAYERS.map((layer, index) => {
            const dot = bake(
              `backdrop:star:${String(index)}`,
              Math.ceil(layer.radius) + 1,
              (graphics) => {
                graphics.fillStyle(0xb8eaff, 1);
                graphics.fillCircle(0, 0, layer.radius);
              }
            );
            const blitter = scene.add
              .blitter(0, 0, dot)
              .setScrollFactor(0)
              .setDepth(STAR_DEPTH + index * STAR_DEPTH_STEP);
            const stars = Array.from({ length: layer.count }, () => ({
              bob: blitter.create(0, 0),
              home: {
                u: random.next(),
                v: random.next(),
                depth: layer.depthMin + random.next() * (layer.depthMax - layer.depthMin)
              },
              phase: random.next() * Math.PI * 2
            }));
            return { blitter, stars };
          });
    this.twinkle = !(
      (
        globalThis as { matchMedia?: (query: string) => { readonly matches: boolean } }
      ).matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }

  /** Called every frame with the drawn camera focus; lays out again only when the frame changed. */
  update(
    scene: Phaser.Scene,
    focus: Point,
    snapshot: DisplayGameSnapshot,
    renderer: { readonly width: number; readonly height: number },
    seconds: number
  ): void {
    if (this.picture === undefined && this.fields.length === 0) return;
    const zoom = scene.cameras.main.zoom;
    const strength = snapshot.background.parallaxStrength;
    // The radius and the strength hold for a whole run, so in practice the window and zoom move it.
    const key = [renderer.width, renderer.height, zoom, snapshot.arenaRadius, strength].join(":");
    if (key !== this.layoutKey) this.layout(key, renderer, zoom, snapshot.arenaRadius, strength);

    if (this.picture !== undefined) {
      const shift = backdropShift(
        focus.x,
        focus.y,
        snapshot.worldWidth / 2,
        snapshot.worldHeight / 2,
        strength,
        this.marginX,
        this.marginY
      );
      this.picture.setPosition(
        this.cover.x + this.cover.width / 2 + shift.x,
        this.cover.y + this.cover.height / 2 + shift.y
      );
    }
    for (const field of this.fields) {
      for (const star of field.stars) {
        const at = starPosition(
          star.home,
          focus.x,
          focus.y,
          this.cover.width,
          this.cover.height,
          strength
        );
        star.bob.x = at.x;
        star.bob.y = at.y;
        star.bob.alpha = starAlpha(star.home.depth, star.phase, seconds, this.twinkle);
      }
    }
  }

  private layout(
    key: string,
    renderer: { readonly width: number; readonly height: number },
    zoom: number,
    arenaRadius: number,
    strength: number
  ): void {
    this.layoutKey = key;
    this.cover = getBackgroundCoverRect(renderer.width, renderer.height, zoom);
    for (const field of this.fields) field.blitter.setPosition(this.cover.x, this.cover.y);
    if (this.picture === undefined) return;
    const { width, height } = this.picture.frame;
    const scale = backdropPictureScale(this.picture.frame, this.cover, arenaRadius, strength);
    this.picture.setDisplaySize(width * scale, height * scale);
    this.marginX = (width * scale - this.cover.width) / 2;
    this.marginY = (height * scale - this.cover.height) / 2;
  }
}
