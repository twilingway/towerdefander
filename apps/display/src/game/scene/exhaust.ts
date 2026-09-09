import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { getFxEffect, type FxEffect } from "@spaceship-defender/fx-assets";

import { turretMountPoint } from "../entityArt.js";
import {
  EXHAUST_ROTATION_OFFSET,
  EXHAUST_THROAT_UNITS,
  getExhaustPlume,
  type Point
} from "../spaceshipViewModel.js";

const EFFECT_ID = "plasma-exhaust";
const TEXTURE_KEY = "fx:plasma-exhaust";
const ANIMATION_KEY = "fx:plasma-exhaust:loop";
/** Behind the hull (10), ahead of the asteroids (5). */
const DEPTH = 9;
/** The throat, written in the hull's frame for `turretMountPoint` to turn. */
const THROAT_MOUNT = { mountX: -EXHAUST_THROAT_UNITS, mountY: 0 } as const;

/**
 * The engine plume: one baked loop from `@spaceship-defender/fx-assets`, sized
 * every frame from how hard the ship is driving forward.
 *
 * A sprite, not a drawing - the whole reason the effect is baked into an atlas
 * in the first place. The loop is 16 cells of one texture, so the cost per frame
 * is a transform and four vertices however turbulent the plume looks.
 *
 * It is the first thing in this app to load an asset over the network, and the
 * scene's `create()` runs to completion synchronously today. Rather than move
 * the whole scene behind a `preload`, the texture is queued here and the sprite
 * appears when it lands: the arena is playable from the first frame either way,
 * and if the load fails there is simply no plume.
 */
export class ExhaustLayer {
  private readonly scene: Phaser.Scene;
  private readonly effect: FxEffect | undefined;
  private sprite: Phaser.GameObjects.Sprite | undefined;
  private disposed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.effect = getFxEffect(EFFECT_ID);
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
    // The boot loader is long finished by the time a scene is running, so a
    // queue added here has to be started by hand.
    scene.load.once("complete", () => {
      this.attach();
    });
    scene.load.start();
    // The atlas can still be in flight when the game goes away: nothing here
    // calls a layer's destroy by hand, `game.destroy(true)` takes the objects
    // with it, and attaching a sprite to a dead scene would throw.
    scene.events.once("shutdown", () => {
      this.dispose();
    });
    scene.events.once("destroy", () => {
      this.dispose();
    });
  }

  /**
   * Places the plume behind the hull. Takes the drawn position and heading
   * rather than the snapshot's, so the plume stays glued to the hull the crew
   * can see, whether that hull came from interpolation or from prediction.
   */
  update(
    position: Point,
    heading: number,
    snapshot: Pick<DisplayGameSnapshot, "drive" | "spaceship">
  ): void {
    const sprite = this.sprite;
    const effect = this.effect;
    if (sprite === undefined || effect === undefined) return;
    // Velocity is only ever the last snapshot's: the predicted pose carries
    // position and heading but no velocity, so under the solo cockpit the plume
    // trails the hull by about a patch. At the width of a flame that does not
    // read, and inventing a velocity here would be the display simulating.
    const plume = getExhaustPlume(
      {
        velocityX: snapshot.spaceship.velocityX,
        velocityY: snapshot.spaceship.velocityY,
        heading
      },
      snapshot.drive.speedPerSecond
    );
    if (!plume.visible) {
      sprite.setVisible(false);
      return;
    }
    const radius = snapshot.spaceship.radius;
    const throat = turretMountPoint({ ...position, radius }, heading, THROAT_MOUNT);
    sprite
      .setVisible(true)
      .setPosition(throat.x, throat.y)
      .setRotation(heading + EXHAUST_ROTATION_OFFSET)
      .setScale(
        (plume.widthUnits * radius) / effect.meta.frameWidth,
        (plume.lengthUnits * radius) / effect.meta.frameHeight
      )
      .setAlpha(plume.alpha);
    sprite.anims.timeScale = plume.timeScale;
  }

  private dispose(): void {
    this.disposed = true;
    this.sprite = undefined;
  }

  private attach(): void {
    const effect = this.effect;
    // A load that failed leaves no texture, and a scene torn down while the
    // atlas was in flight must not grow a sprite afterwards.
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
    this.sprite = this.scene.add
      .sprite(0, 0, TEXTURE_KEY)
      // The throat is the bottom edge of the cell, so length grows away from the
      // hull instead of through it.
      .setOrigin(0.5, 1)
      .setDepth(DEPTH)
      .setVisible(false);
    this.sprite.play(ANIMATION_KEY);
  }
}
