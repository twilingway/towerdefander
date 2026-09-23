import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";

import type { KeyedCollection } from "./projectionTarget.ts";

/**
 * What a run looks and sounds like, published once when it starts.
 *
 * Not part of `projectGameState`, and deliberately so: none of it changes
 * between frames, and a per-tick projection that rewrote strings would be paid
 * for sixty times a second. It is a separate publish because it happens once.
 *
 * Shared because a device needs exactly the same thing: the hull it chose has
 * its own silhouette, its own effects and its own sounds, and the enemy
 * catalogue tells the scene what every archetype looks like. Without this the
 * local run would draw fallback silhouettes and play nothing.
 */
export interface CatalogueTarget {
  asteroidVisualShape: string;
  asteroidVisualScale: number;
  spaceshipVisualShape: string;
  spaceshipVisualScale: number;
  shieldBandEffect: string;
  shieldImpactEffect: string;
  shipDeathEffect: string;
  shipMuzzleEffect: string;
  shipCannonSound: string;
  shipMgSound: string;
  shipHitSound: string;
  shipDeathSound: string;
  turretVisualShape: string;
  turretVisualScale: number;
  turretMountX: number;
  turretMountY: number;
  turretPivotX: number;
  turretPivotY: number;
  machineGunVisualShape: string;
  machineGunVisualScale: number;
  machineGunMountX: number;
  machineGunMountY: number;
  machineGunPivotX: number;
  machineGunPivotY: number;
  shieldRadius: number;
  enemyCatalogue: KeyedCollection<EnemyVisualTarget> & { clear(): void };
}

export interface EnemyVisualTarget {
  kind: string;
  label: string;
  shape: string;
  modelScale: number;
  showHealthBar: boolean;
  isBoss: boolean;
  effectDeath: string;
  effectHit: string;
  effectShot: string;
  soundDeath: string;
  soundHit: string;
  soundShot: string;
}

export function publishEnemyCatalogue(
  display: CatalogueTarget,
  config: SpaceshipSimulationConfig,
  makeVisual: () => EnemyVisualTarget
): void {
  display.asteroidVisualShape = config.asteroidVisual?.shape ?? "";
  display.asteroidVisualScale = config.asteroidVisual?.modelScale ?? 1;
  display.spaceshipVisualShape = config.spaceshipVisual?.shape ?? "";
  display.spaceshipVisualScale = config.spaceshipVisual?.modelScale ?? 1;
  display.shieldBandEffect = config.shieldBandEffect;
  display.shieldImpactEffect = config.shieldImpactEffect;
  display.shipDeathEffect = config.shipDeathEffect;
  display.shipMuzzleEffect = config.shipMuzzleEffect;
  display.shipCannonSound = config.shipCannonSound;
  display.shipMgSound = config.shipMgSound;
  display.shipHitSound = config.shipHitSound;
  display.shipDeathSound = config.shipDeathSound;
  display.turretVisualShape = config.turretVisual?.shape ?? "";
  display.turretVisualScale = config.turretVisual?.modelScale ?? 1;
  display.turretMountX = config.turretVisual?.mountX ?? 0;
  display.turretMountY = config.turretVisual?.mountY ?? 0;
  display.turretPivotX = config.turretVisual?.pivotX ?? 0;
  display.turretPivotY = config.turretVisual?.pivotY ?? 0;
  display.machineGunVisualShape = config.machineGunVisual?.shape ?? "";
  display.machineGunVisualScale = config.machineGunVisual?.modelScale ?? 1;
  display.machineGunMountX = config.machineGunVisual?.mountX ?? 0;
  display.machineGunMountY = config.machineGunVisual?.mountY ?? 0;
  display.machineGunPivotX = config.machineGunVisual?.pivotX ?? 0;
  display.machineGunPivotY = config.machineGunVisual?.pivotY ?? 0;
  display.shieldRadius = config.shieldRadius;

  display.enemyCatalogue.clear();
  for (const [kind, archetype] of Object.entries(config.enemyArchetypes)) {
    const entry = makeVisual();
    entry.kind = kind;
    entry.label = archetype.label;
    entry.shape = archetype.visual.shape;
    entry.modelScale = archetype.visual.modelScale;
    entry.showHealthBar = archetype.visual.showHealthBar;
    entry.isBoss = archetype.spawnPolicy === "boss";
    entry.effectDeath = archetype.visual.effects?.death ?? "";
    entry.effectHit = archetype.visual.effects?.hit ?? "";
    entry.effectShot = archetype.visual.effects?.shot ?? "";
    entry.soundDeath = archetype.visual.sounds?.death ?? "";
    entry.soundHit = archetype.visual.sounds?.hit ?? "";
    entry.soundShot = archetype.visual.sounds?.shot ?? "";
    display.enemyCatalogue.set(kind, entry);
  }
}
