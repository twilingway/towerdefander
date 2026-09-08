import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { bakeShape } from "../bake.js";
import { drawCatalogAssetById } from "../catalogRenderer.js";
import { turretMountPoint } from "../entityArt.js";
import {
  createAngleTrack,
  createSnappedVisualTransitions,
  type AngleTrack,
  type PointTrack
} from "../playback.js";
import { drawTankTurret, readTankLook, TANK_ART_HALF } from "../tankArt.js";

export type TurretObject = Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.GameObject & { rotation: number };

/**
 * The gun sits on top of the hull and turns with the turret angle. A chosen
 * asset is drawn centred on the ship, since that is where the mount is; without
 * one the old bar keeps its off-centre pivot so it still reads as a barrel.
 */

export function createTurret(scene: Phaser.Scene, snapshot: DisplayGameSnapshot): TurretObject {
  const visual = snapshot.turretVisual;
  if (visual === null) {
    return scene.add
      .rectangle(snapshot.spaceship.x, snapshot.spaceship.y, 92, 16, 0xffd36f)
      .setOrigin(0.16, 0.5)
      .setDepth(12)
      .setRotation(snapshot.turretAngle);
  }

  // The drawing is offset inside a container so the container itself still
  // turns about the ship's centre: nudging the asset must move the gun, never
  // the point it spins around.
  const tankLook = readTankLook(
    (globalThis as { location?: { search?: string } }).location?.search ?? ""
  );

  const gun = scene.add
    .image(
      0,
      0,
      tankLook
        ? bakeShape(scene, "tank:turret", TANK_ART_HALF + 24, drawTankTurret)
        : bakeShape(
            scene,
            `turret:${visual.shape}:${String(visual.modelScale)}:${String(Math.round(snapshot.spaceship.radius))}`,
            snapshot.spaceship.radius * visual.modelScale * 1.6 + 6,
            (graphics) => {
              drawCatalogAssetById(
                graphics,
                visual.shape,
                snapshot.spaceship.radius * visual.modelScale
              );
            }
          )
    )
    // Where the prototype mounts it: a third along the sprite, so the barrel
    // turns about the mantlet rather than about its own middle.
    .setOrigin(tankLook ? 0.32 : 0.5, 0.5)
    .setScale(tankLook ? snapshot.spaceship.radius / TANK_ART_HALF : 1);
  gun.setPosition(
    visual.pivotX * snapshot.spaceship.radius,
    visual.pivotY * snapshot.spaceship.radius
  );
  const mount = turretMountPoint(snapshot.spaceship, snapshot.spaceship.heading, visual);
  return scene.add
    .container(mount.x, mount.y, [gun])
    .setDepth(12)
    .setRotation(snapshot.turretAngle);
}

/** The three objects that make up the ship on the field. */
export interface ShipParts {
  readonly body: Phaser.GameObjects.Image;
  readonly nose: Phaser.GameObjects.Image | undefined;
  readonly turret: TurretObject;
}

/**
 * Puts the ship exactly where a fresh snapshot says, with no interpolation to
 * walk it there: a new run, a reconnect or a hydration has no earlier sample to
 * come from, and easing out of the last one would show the ship sliding across
 * the arena from wherever it used to be.
 */
export function snapShipToSnapshot(
  parts: ShipParts,
  snapshot: DisplayGameSnapshot,
  tick: number
): {
  readonly spaceship: PointTrack;
  readonly heading: AngleTrack;
  readonly turret: AngleTrack;
  readonly shield: AngleTrack;
} {
  parts.body.setPosition(snapshot.spaceship.x, snapshot.spaceship.y);
  parts.nose
    ?.setPosition(snapshot.spaceship.x, snapshot.spaceship.y)
    .setRotation(snapshot.spaceship.heading);
  const mount = turretMountPoint(
    snapshot.spaceship,
    snapshot.spaceship.heading,
    snapshot.turretVisual
  );
  parts.turret.setPosition(mount.x, mount.y);
  parts.turret.setRotation(snapshot.turretAngle);
  const tracks = createSnappedVisualTransitions(snapshot, tick);
  return {
    spaceship: tracks.spaceship,
    heading: createAngleTrack(snapshot.spaceship.heading, tick),
    turret: tracks.turret,
    shield: tracks.shield
  };
}
