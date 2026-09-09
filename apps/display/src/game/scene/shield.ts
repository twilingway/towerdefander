import Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { getFxEffect, type FxEffect } from "@spaceship-defender/fx-assets";

import type { ShieldPose } from "./shieldImpact.js";
import {
  getShieldArcRange,
  getShieldBandAlpha,
  getShieldBandPoints,
  getShieldCrescentPoints,
  getShieldDashSegments,
  getShieldVisualStyle,
  type Point
} from "../spaceshipViewModel.js";

const EFFECT_ID = "shield-band";
const TEXTURE_KEY = "fx:shield-band";
const ANIMATION_KEY = "fx:shield-band:loop";
/** The crescent's own depth, unchanged, and the band right over it. */
const CRESCENT_DEPTH = 14;
const BAND_DEPTH = 15;
/**
 * How thick the barrier is drawn, in world units.
 *
 * Wider than the crescent's 11, because the barrier replaces it rather than
 * lying over it, and because the check that measures the shield counts pixels:
 * a barrier is a band of soft light where the crescent was a filled shape, so
 * it needs more width to put the same amount of the shield's own blue on screen.
 *
 * The first version was 9 - deliberately narrower than the crescent, to leave
 * its blue margins untouched - and that was wrong twice over. A dim additive
 * strip inside a bright arc is invisible, and the arc it was protecting is gone.
 */
const BAND_THICKNESS_UNITS = 20;
/** Where the taper starts, as a share of the sector from either tip. */
const BAND_TAPER_SHARE = 0.18;

/**
 * The band's alpha per vertex: full across the middle, out at the tips.
 *
 * The crescent narrows to nothing at both ends and the band has to do the same,
 * or the barrier ends in a blunt cut the shape underneath does not have.
 */
function bandAlphas(count: number): number[] {
  const last = Math.max(1, count - 1);
  return Array.from({ length: count }, (_unused, index) => {
    const fromTip = Math.min(index, last - index) / last;
    return Math.min(1, fromTip / BAND_TAPER_SHARE);
  });
}

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

/**
 * The shield, baked once per state and turned to its bearing.
 *
 * It was the last drawing left on the field, and the dearest: a hundred-point
 * crescent, filled - which means triangulated - on every frame the sector was
 * up, and a profile of a real wave put the tessellator and the graphics batcher
 * at the top with it.
 *
 * It was drawn that way for a reason that no longer holds. Turning it used to
 * tear the bloom off, because a `Graphics` object carries no width or height,
 * Phaser calls it poorly bounded, and the focus region its filter is composited
 * through does not follow a rotation. An `Image` has a size, so the filter
 * follows the object like any other; the arc is baked centred on zero and the
 * image is simply turned.
 */
export function drawShield(
  shield: Phaser.GameObjects.Image,
  hull: { readonly x: number; readonly y: number },
  snapshot: DisplayGameSnapshot,
  bearing: number,
  visible: boolean,
  bake: BakeShape
): void {
  const style = getShieldVisualStyle(snapshot.shield.active);
  const radius = snapshot.shieldRadius;
  const half = snapshot.shield.arcHalfAngle;
  // The bake is keyed by everything that changes its shape; the bearing is not
  // one of those things, which is the whole point.
  const key = `shield:${snapshot.shield.active ? "up" : "down"}:${String(Math.round(radius))}:${half.toFixed(3)}`;
  const extent = radius + style.lineWidth + 4;
  shield.setTexture(
    bake(key, extent, (graphics) => {
      const arc = getShieldArcRange(0, half);
      graphics.lineStyle(style.lineWidth, style.color, style.alpha);
      if (style.crescentThickness !== null) {
        const crescent = getShieldCrescentPoints(
          arc.start,
          arc.end,
          radius,
          style.crescentThickness
        );
        if (crescent.length > 0) {
          graphics.fillStyle(style.color, style.alpha);
          graphics.fillPoints(
            crescent.map((point) => new Phaser.Math.Vector2(point.x, point.y)),
            true,
            true
          );
        }
      } else if (style.dash === null) {
        graphics.beginPath();
        graphics.arc(0, 0, radius, arc.start, arc.end, false);
        graphics.strokePath();
      } else {
        for (const segment of getShieldDashSegments(arc.start, arc.end, radius, style.dash)) {
          graphics.beginPath();
          graphics.arc(0, 0, radius, segment.start, segment.end, false);
          graphics.strokePath();
        }
      }
    })
  );
  shield.setPosition(hull.x, hull.y);
  shield.setRotation(bearing);
  shield.setVisible(visible);
}

/**
 * The shield as the crew sees it: the baked crescent, and a living barrier over
 * it.
 *
 * The crescent stays exactly what it was - a texture baked per shape and turned
 * to its bearing - because that is already the cheap way to draw a fixed shape.
 * What it could not do is move, and a sector under fire that looks identical to
 * one at rest is the gap this closes.
 *
 * The animation cannot be baked as a sector, because the sector's width is not
 * fixed: two module cards widen it, and its base value is an operator's setting.
 * So the art is a straight band, and a `Rope` bends it along the arc - points in
 * the layer's own frame, rebuilt only when the shape changes, and the object
 * turned every frame the way the crescent already is.
 *
 * One number ties the two together. A horizontal `Rope` takes its thickness from
 * half its frame's height in local units, and the transform scales the points
 * with it, so the scale is chosen from the thickness wanted and the points are
 * built at the radius that lands on the arc once scaled.
 */
export class ShieldLayer {
  private readonly scene: Phaser.Scene;
  private readonly bake: BakeShape;
  private readonly crescent: Phaser.GameObjects.Image;
  private readonly effect: FxEffect | undefined;
  private readonly scale: number;
  private band: Phaser.GameObjects.Rope | undefined;
  /** The geometry the points were built for; a change rebuilds them. */
  private shape = "";
  private drawnPose: ShieldPose | undefined;
  private disposed = false;

  constructor(scene: Phaser.Scene, blankTexture: string, bake: BakeShape) {
    this.scene = scene;
    this.bake = bake;
    this.crescent = scene.add.image(0, 0, blankTexture).setDepth(CRESCENT_DEPTH);
    this.effect = getFxEffect(EFFECT_ID);
    this.scale =
      this.effect === undefined ? 1 : BAND_THICKNESS_UNITS / this.effect.meta.frameHeight;
    if (this.effect === undefined) return;
    if (scene.textures.exists(TEXTURE_KEY)) {
      this.attach();
      return;
    }
    scene.load.spritesheet(TEXTURE_KEY, this.effect.url, {
      frameWidth: this.effect.meta.frameWidth,
      frameHeight: this.effect.meta.frameHeight,
      endFrame: this.effect.meta.frames - 1
    });
    scene.load.once("complete", () => {
      this.attach();
    });
    scene.load.start();
    scene.events.once("shutdown", () => {
      this.dispose();
    });
    scene.events.once("destroy", () => {
      this.dispose();
    });
  }

  draw(
    hull: { readonly x: number; readonly y: number },
    snapshot: DisplayGameSnapshot,
    bearing: number,
    visible: boolean
  ): void {
    // The barrier replaces the crescent rather than lying over it: two takes on
    // the same arc read as a doubled edge, and the animated one is the shield
    // now. The crescent still draws while the atlas is in flight, and it is
    // still the whole picture for a lowered sector - that dashed arc is what
    // "down" looks like and nothing here changes it.
    const barrier = this.band !== undefined && snapshot.shield.active;
    drawShield(this.crescent, hull, snapshot, bearing, visible && !barrier, this.bake);
    this.drawBand(hull, snapshot, bearing, visible);
    this.drawnPose =
      visible && snapshot.shield.active ? { centre: { x: hull.x, y: hull.y }, bearing } : undefined;
  }

  /**
   * Where the barrier is on screen right now, or nothing while it is down.
   *
   * Whatever lands on the shield has to be placed against the pose the crew is
   * looking at, and this layer is what decided that pose - so it answers for it
   * rather than every caller recomputing it from the snapshot and getting a
   * point a patch behind the picture.
   */
  pose(): ShieldPose | undefined {
    return this.drawnPose;
  }

  setVisible(visible: boolean): void {
    this.crescent.setVisible(visible);
    if (!visible) this.band?.setVisible(false);
  }

  private drawBand(
    hull: { readonly x: number; readonly y: number },
    snapshot: DisplayGameSnapshot,
    bearing: number,
    visible: boolean
  ): void {
    const band = this.band;
    if (band === undefined) return;
    // A lowered shield keeps its dashed arc and nothing else: the band is what
    // "up" looks like, so it has to be absent when the sector is down.
    if (!visible || !snapshot.shield.active) {
      band.setVisible(false);
      return;
    }
    const radius = snapshot.shieldRadius;
    const half = snapshot.shield.arcHalfAngle;
    const shape = `${String(Math.round(radius))}:${half.toFixed(3)}`;
    if (shape !== this.shape) {
      const points = getShieldBandPoints(radius / this.scale, half);
      band.setPoints(
        points.map((point: Point) => ({ x: point.x, y: point.y })),
        undefined,
        bandAlphas(points.length)
      );
      this.shape = shape;
    }
    band
      .setVisible(true)
      .setPosition(hull.x, hull.y)
      .setRotation(bearing)
      .setAlpha(getShieldBandAlpha(snapshot.shield.energy, snapshot.shield.capacity));
  }

  private dispose(): void {
    this.disposed = true;
    this.band = undefined;
  }

  private attach(): void {
    const effect = this.effect;
    if (this.disposed || effect === undefined || !this.scene.textures.exists(TEXTURE_KEY)) return;
    if (!this.scene.anims.exists(ANIMATION_KEY)) {
      this.scene.anims.create({
        key: ANIMATION_KEY,
        frames: this.scene.anims.generateFrameNumbers(TEXTURE_KEY, {
          start: 0,
          end: effect.meta.frames - 1
        }),
        frameRate: effect.meta.fps,
        repeat: -1
      });
    }
    // Added through the factory so Phaser registers it for `preUpdate` and the
    // loop advances itself.
    this.band = this.scene.add
      // A unit arc to start: the factory wants real points, and the first draw
      // replaces them with the sector's own once a snapshot says how wide it is.
      .rope(0, 0, TEXTURE_KEY, 0, [...getShieldBandPoints(1, 1)], true)
      .setDepth(BAND_DEPTH)
      .setScale(this.scale)
      // The art is additive - a dark gradient tail is dark pixels with alpha,
      // and composited normally it would draw a box around the barrier.
      .setBlendMode("ADD")
      .setVisible(false);
    this.band.play(ANIMATION_KEY);
  }
}
