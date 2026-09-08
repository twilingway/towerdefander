import type Phaser from "phaser";
import { ENEMY_BEAM_SOURCE, type DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { pickFocusedTarget } from "../../model/combatFocus.js";
import { fillFocusCandidates, type MutableFocusCandidate } from "../spaceshipViewModel.js";

/**
 * The wedge is baked at a fixed side and stretched to the reach, the way the
 * arena floor is: a nine-hundred-unit cone drawn at world size would be a
 * nine-hundred-pixel texture.
 */
const AIM_TEXTURE_SIDE = 512;

/**
 * The aiming envelope. Faint enough to read the arena through it, with edges
 * solid enough to be a line rather than a glow.
 */
const AIM_ENVELOPE_STYLE = {
  color: 0x7ef0ff,
  fillAlpha: 0.05,
  edgeAlpha: 0.28,
  width: 2
} as const;
/**
 * The ring says two things in two colours. White while the target is merely the
 * one being held - breathing, so a still frame still reads as "this one, now".
 * Green the moment the barrel is actually on it and inside its reach, which is
 * the only moment a shot connects; that one holds steady, because a light that
 * means "fire" should not be blinking.
 */
const FOCUS_RING_HELD_COLOR = 0xffffff;
const FOCUS_RING_FIRABLE_COLOR = 0x62ff9b;
const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_FIRABLE_WIDTH = 3;
const FOCUS_RING_MARGIN = 10;
const FOCUS_RING_BREATH_MS = 220;

/**
 * The nose gun's mark: two brackets rather than a ring, and yellow rather than
 * white, because it is a different barrel with a different bore. The pilot flies
 * this one - the hull is the mount - so the ship it is about to be fired into is
 * worth saying out loud even though no envelope is drawn for it.
 */
const NOSE_FOCUS_COLOR = 0xffd24a;
const NOSE_FOCUS_WIDTH = 2;
const NOSE_FOCUS_MARGIN = 16;
/** Half the span of each bracket, so the pair reads as "( )" around the hull. */
const NOSE_FOCUS_SWEEP = Math.PI / 5;

/** A barrel with no lock cone still shows this much, so its reach is legible. */
const AIM_MIN_HALF_ANGLE = 0.03;

/** Turret and nose beams read apart the way their projectiles already do. */
const LASER_CANNON_STYLE = { width: 3, color: 0x7ef0ff, alpha: 0.9 } as const;
const LASER_NOSE_STYLE = { width: 2, color: 0xffd783, alpha: 0.85 } as const;
/**
 * Hostile fire is red on this display and ours is not, so the beam follows the
 * same rule. Thicker than either of ours, because a hit that cannot be dodged
 * has to be the thing you see first.
 */
const LASER_ENEMY_STYLE = { width: 4, color: 0xff5a4a, alpha: 0.9 } as const;

function beamStyle(source: string) {
  if (source === ENEMY_BEAM_SOURCE) return LASER_ENEMY_STYLE;
  return source === "cannon" ? LASER_CANNON_STYLE : LASER_NOSE_STYLE;
}

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

/** Where an enemy is actually drawn this frame - predictor first, track second. */
type ReadDrawnPoint = (entityId: string) => { readonly x: number; readonly y: number } | undefined;

/**
 * Everything that answers "where can this gun reach, and what is it about to
 * hit": the cone, the turret's ring, the nose gun's brackets and the beams.
 *
 * It owns the three pieces of state that go with them - the shape the wedge was
 * last built for and the target each ring is holding - because nothing else in
 * the scene reads them.
 */
export class AimingLayer {
  private envelopeShape: { readonly reach: number; readonly half: number } | undefined;
  private focusedEntityId: string | undefined;
  private noseFocusedEntityId: string | undefined;
  /** Refilled every frame rather than rebuilt; no candidate outlives the frame. */
  private readonly focusScratch: MutableFocusCandidate[] = [];

  constructor(
    private readonly beams: Phaser.GameObjects.Graphics,
    private readonly envelope: Phaser.GameObjects.Image,
    private readonly focusRing: Phaser.GameObjects.Image,
    private readonly noseFocus: Phaser.GameObjects.Image,
    private readonly bake: BakeShape
  ) {}

  drawBeams(snapshot: DisplayGameSnapshot): void {
    this.beams.clear();
    for (const beam of snapshot.laserBeams) {
      const style = beamStyle(beam.source);
      this.beams.lineStyle(style.width, style.color, style.alpha);
      this.beams.beginPath();
      this.beams.moveTo(beam.fromX, beam.fromY);
      this.beams.lineTo(beam.toX, beam.toY);
      this.beams.strokePath();
      this.beams.fillStyle(style.color, style.alpha);
      this.beams.fillCircle(beam.fromX, beam.fromY, style.width);
    }
  }

  /**
   * Where the turret can reach, and - for a barrel that locks on - how far off
   * the bore it will still take a lock. The fill says "inside here"; the two
   * rays say where the edge is, because a wash of colour alone reads as glow
   * rather than as a boundary.
   *
   * A barrel that locks onto nothing still gets a sliver, so the reach stays
   * readable: the gunner's question is as often "does it even carry that far"
   * as "am I on it".
   */
  /**
   * Where the gun can reach, built once and then carried.
   *
   * The wedge is a filled path, and a filled path is triangulated every time it
   * is drawn: under a phone's budget the tessellator and the graphics batcher
   * together were most of a frame. Its shape does not change during a run -
   * only where it points and where it starts - so it is built in the barrel's
   * own coordinates and moved like any other object, and rebuilt only when the
   * reach or the cone itself changes.
   */
  drawEnvelope(
    origin: { readonly x: number; readonly y: number },
    angle: number,
    snapshot: DisplayGameSnapshot,
    visible: boolean
  ): void {
    const layer = this.envelope;
    const { reach, acquireHalfAngle } = snapshot.cannon;
    if (reach <= 0) {
      layer.setVisible(false);
      return;
    }
    const half = Math.max(acquireHalfAngle, AIM_MIN_HALF_ANGLE);
    const shape = this.envelopeShape;
    if (shape?.reach !== reach || shape.half !== half) {
      this.envelopeShape = { reach, half };
      /*
       * Baked at a fixed size and stretched to the reach, the way the arena
       * floor is: a wedge nine hundred units long would be a nine-hundred pixel
       * texture otherwise, and a fan of triangles carries that stretch without
       * showing it. The barrel sits at the middle of the square, so half the
       * texture is empty - which is the price of having the image turn about
       * the gun rather than about its own bounding box.
       */
      const side = AIM_TEXTURE_SIDE;
      const drawn = side / 2;
      const key = `aim:${String(Math.round(reach))}:${half.toFixed(3)}`;
      layer.setTexture(
        this.bake(key, drawn, (graphics) => {
          graphics.fillStyle(AIM_ENVELOPE_STYLE.color, AIM_ENVELOPE_STYLE.fillAlpha);
          graphics.slice(0, 0, drawn, -half, half);
          graphics.fillPath();
          /*
           * Drawn at the texture's scale, not the world's.
           *
           * The image is stretched from this square to twice the reach, and a
           * stroke stretches with it: left at its world width the two edges
           * came out three and a half times too thick and the cone read as a
           * beam across the screen. The arena floor does the same arithmetic
           * for the same reason.
           */
          graphics.lineStyle(
            (AIM_ENVELOPE_STYLE.width * drawn) / reach,
            AIM_ENVELOPE_STYLE.color,
            AIM_ENVELOPE_STYLE.edgeAlpha
          );
          for (const edge of [-half, half]) {
            graphics.beginPath();
            graphics.moveTo(0, 0);
            graphics.lineTo(Math.cos(edge) * drawn, Math.sin(edge) * drawn);
            graphics.strokePath();
          }
        })
      );
      layer.setDisplaySize(reach * 2, reach * 2);
    }
    layer.setVisible(visible);
    layer.setPosition(origin.x, origin.y);
    layer.setRotation(angle);
  }

  /**
   * A ring around the ship a shot would hit right now, breathing so it reads as
   * live rather than as decoration. There is no lock in this game - the gunner
   * turns a barrel - so the ring is read off the geometry every frame, and it
   * moves the moment the bore does.
   *
   * Drawn at the interpolated positions, not the snapshot's, or it would sit a
   * frame behind the ship it is marking.
   */
  drawFocusRing(
    origin: { readonly x: number; readonly y: number },
    bearing: number,
    candidates: readonly MutableFocusCandidate[],
    snapshot: DisplayGameSnapshot,
    visible: boolean,
    now: number
  ): void {
    const layer = this.focusRing;
    const focus = pickFocusedTarget({
      origin,
      bearing,
      reach: snapshot.cannon.reach,
      speed: snapshot.cannon.speed,
      heldEntityId: this.focusedEntityId,
      candidates
    });
    this.focusedEntityId = focus?.target.entityId;
    if (focus === undefined) {
      layer.setVisible(false);
      return;
    }
    const { target, firable } = focus;
    // A ring per calibre, and the breathing is the image's alpha rather than a
    // colour drawn again: an alpha is a number on an existing texture.
    const radius = Math.round(target.radius + FOCUS_RING_MARGIN);
    const width = firable ? FOCUS_RING_FIRABLE_WIDTH : FOCUS_RING_WIDTH;
    const colour = firable ? FOCUS_RING_FIRABLE_COLOR : FOCUS_RING_HELD_COLOR;
    layer.setTexture(
      this.bake(
        `focus:${firable ? "hot" : "held"}:${String(radius)}`,
        radius + width + 2,
        (graphics) => {
          graphics.lineStyle(width, colour, 1);
          graphics.strokeCircle(0, 0, radius);
        }
      )
    );
    layer.setVisible(visible);
    layer.setPosition(target.x, target.y);
    layer.setAlpha(firable ? 0.9 : 0.55 + 0.45 * Math.sin(now / FOCUS_RING_BREATH_MS));
  }

  /**
   * The ship the nose gun is about to be fired into. Same question as the ring
   * asks of the turret, put to the other barrel: the hull is this one's mount,
   * so the bearing is the ship's own heading.
   */
  drawNoseFocus(
    origin: { readonly x: number; readonly y: number },
    heading: number,
    candidates: readonly MutableFocusCandidate[],
    snapshot: DisplayGameSnapshot,
    visible: boolean
  ): void {
    const layer = this.noseFocus;
    const focus = pickFocusedTarget({
      origin,
      bearing: heading,
      reach: snapshot.machineGun.reach,
      speed: snapshot.machineGun.speed,
      heldEntityId: this.noseFocusedEntityId,
      candidates
    });
    this.noseFocusedEntityId = focus?.target.entityId;
    if (focus?.firable !== true) {
      layer.setVisible(false);
      return;
    }
    const { target } = focus;
    const radius = Math.round(target.radius + NOSE_FOCUS_MARGIN);
    layer.setTexture(
      this.bake(`nosefocus:${String(radius)}`, radius + NOSE_FOCUS_WIDTH + 2, (graphics) => {
        graphics.lineStyle(NOSE_FOCUS_WIDTH, NOSE_FOCUS_COLOR, 0.85);
        // Two arcs across the line of fire, drawn about the bore and then
        // turned with the image, so the brackets open toward the shooter
        // however the pair happens to be placed.
        for (const side of [Math.PI / 2, -Math.PI / 2]) {
          graphics.beginPath();
          graphics.arc(0, 0, radius, side - NOSE_FOCUS_SWEEP, side + NOSE_FOCUS_SWEEP);
          graphics.strokePath();
        }
      })
    );
    layer.setVisible(visible);
    layer.setPosition(target.x, target.y);
    layer.setRotation(Math.atan2(target.y - origin.y, target.x - origin.x));
  }

  /**
   * The ships both rings are read against, at the positions being drawn rather
   * than the ones last sent.
   *
   * Refills `focusScratch` instead of building a list, so a steady crowd costs
   * nothing per frame. What makes that safe is that no candidate outlives the
   * frame: both callers read the winner immediately and keep only its id.
   */
  updateCandidates(
    snapshot: DisplayGameSnapshot,
    readDrawnPoint: ReadDrawnPoint
  ): readonly MutableFocusCandidate[] {
    return fillFocusCandidates(
      this.focusScratch,
      snapshot.enemyShips,
      (enemy) => readDrawnPoint(enemy.entityId) ?? enemy
    );
  }

  /** All four drawings answer the vectors switch together. */
  setVisible(visible: boolean): void {
    for (const drawing of [this.beams, this.envelope, this.focusRing, this.noseFocus]) {
      drawing.setVisible(visible);
    }
  }
}
