import type Phaser from "phaser";
import { createSeededRandom } from "@spaceship-defender/game-core";
import type { BackdropImage, DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { getBackdropArt } from "@spaceship-defender/sprite-assets";

import type { BakeShape } from "../catalogTexture.js";
import type { Point } from "../spaceshipViewModel.js";
import {
  backdropShiftShare,
  getBackgroundCoverRect,
  starAlpha,
  starPosition,
  type BackgroundCoverRect
} from "../viewport.js";

/** Under the arena floor, which sits at depth 0, and everything that stands on it. */
const PICTURE_DEPTH = -20;
const STAR_DEPTH = -19;
/** The picture is drawn this much larger than the frame; the extra is the room it moves in. */
const PICTURE_SLACK = 1.18;
const STAR_COUNT = 170;
const STAR_TEXTURE = "backdrop:star";
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

/**
 * The sky: one picture and a field of stars, both fixed to the screen and under the arena.
 *
 * Nothing here is drawn per frame. The picture is an image of a loaded texture and the stars are
 * bobs of one baked dot in a single blitter, so a frame only moves them and sets how bright the
 * stars are - the rule every other layer of this scene already follows. The sky it replaces was
 * four tiled layers and cost weak phones their frame rate; this one is two batches.
 */
export class BackdropLayer {
  private readonly picture: Phaser.GameObjects.Image | undefined;
  private readonly field: Phaser.GameObjects.Blitter;
  private readonly stars: readonly Star[];
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
    const dot = bake(STAR_TEXTURE, 4, (graphics) => {
      graphics.fillStyle(0xb8eaff, 1);
      graphics.fillCircle(0, 0, 2.4);
    });
    this.field = scene.add.blitter(0, 0, dot).setScrollFactor(0).setDepth(STAR_DEPTH);
    const random = createSeededRandom(STAR_SEED);
    this.stars =
      image === "none"
        ? []
        : Array.from({ length: STAR_COUNT }, () => ({
            bob: this.field.create(0, 0),
            home: { u: random.next(), v: random.next(), depth: 0.2 + random.next() * 0.8 },
            phase: random.next() * Math.PI * 2
          }));
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
    if (this.picture === undefined && this.stars.length === 0) return;
    const zoom = scene.cameras.main.zoom;
    const key = `${String(renderer.width)}x${String(renderer.height)}@${String(zoom)}`;
    if (key !== this.layoutKey) this.layout(key, renderer, zoom);

    const strength = snapshot.background.parallaxStrength;
    if (this.picture !== undefined) {
      const share = backdropShiftShare(
        focus.x,
        focus.y,
        snapshot.worldWidth / 2,
        snapshot.worldHeight / 2,
        snapshot.arenaRadius,
        strength
      );
      this.picture.setPosition(
        this.cover.x + this.cover.width / 2 + share.x * this.marginX,
        this.cover.y + this.cover.height / 2 + share.y * this.marginY
      );
    }
    for (const star of this.stars) {
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

  private layout(
    key: string,
    renderer: { readonly width: number; readonly height: number },
    zoom: number
  ): void {
    this.layoutKey = key;
    this.cover = getBackgroundCoverRect(renderer.width, renderer.height, zoom);
    this.field.setPosition(this.cover.x, this.cover.y);
    if (this.picture === undefined) return;
    const { width, height } = this.picture.frame;
    const scale = Math.max(
      (this.cover.width * PICTURE_SLACK) / width,
      (this.cover.height * PICTURE_SLACK) / height
    );
    this.picture.setDisplaySize(width * scale, height * scale);
    this.marginX = (width * scale - this.cover.width) / 2;
    this.marginY = (height * scale - this.cover.height) / 2;
  }
}
