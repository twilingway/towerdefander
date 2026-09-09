import {
  NEBULA_PRESETS,
  type CrewRole,
  type NebulaPreset,
  type PublicUpgradeVote
} from "@spaceship-defender/protocol";

import type {
  NetworkHomingMissileState,
  NetworkProjectileState,
  NetworkTeamUpgradeState,
  ValueCollection
} from "./wire.js";

export const ZERO_DRIVE = {
  revision: 0,
  speedPerSecond: 0,
  accelerationPerSecondSquared: 0,
  brakingPerSecondSquared: 0,
  reverseSpeedFactor: 0,
  headingMaxAngularSpeed: 0,
  headingAngularAcceleration: 0,
  headingAngularBraking: 0,
  turretMaxAngularSpeed: 0,
  turretAngularAcceleration: 0,
  turretAngularBraking: 0,
  hullRadius: 1
} as const;

/**
 * The wire carries a flag beside each bearing because every angle is a legal
 * heading and no value could stand for "none". The view puts the two back
 * together as a nullable angle, which is what the step actually takes.
 */
export interface PoseOnWire {
  x?: number;
  y?: number;
  velocityX?: number;
  velocityY?: number;
  heading?: number;
  turretAngle?: number;
  headingAngularVelocity?: number;
  hasHeadingTarget?: boolean;
  headingTargetAngle?: number;
  turretAngularVelocity?: number;
  hasTurretTarget?: boolean;
  turretTargetAngle?: number;
}

export function toPoseView(pose: PoseOnWire | undefined) {
  return {
    x: pose?.x ?? 0,
    y: pose?.y ?? 0,
    velocityX: pose?.velocityX ?? 0,
    velocityY: pose?.velocityY ?? 0,
    heading: pose?.heading ?? 0,
    turretAngle: pose?.turretAngle ?? 0,
    headingAngularVelocity: pose?.headingAngularVelocity ?? 0,
    headingTargetAngle: pose?.hasHeadingTarget === true ? (pose.headingTargetAngle ?? 0) : null,
    turretAngularVelocity: pose?.turretAngularVelocity ?? 0,
    turretTargetAngle: pose?.hasTurretTarget === true ? (pose.turretTargetAngle ?? 0) : null
  };
}

/**
 * The last moment whose shape was checked in full; see the note at the parse.
 */

export function toTeamUpgradeView(teamUpgrade: NetworkTeamUpgradeState | undefined) {
  const votes: Record<CrewRole, PublicUpgradeVote | null> = {
    pilot: null,
    gunner: null,
    shield: null
  };
  if (teamUpgrade !== undefined) {
    for (const vote of teamUpgrade.votes.values()) {
      votes[vote.role] = {
        role: vote.role,
        upgradeId: vote.upgradeId,
        revision: vote.revision
      };
    }
  }
  return {
    offer:
      teamUpgrade?.hasOffer === true
        ? {
            offerId: teamUpgrade.offer.offerId,
            waveNumber: teamUpgrade.offer.waveNumber,
            tier: teamUpgrade.offer.tier,
            cards: [...teamUpgrade.offer.cards.values()].map((card) => ({
              ...card,
              effects: [...card.effects.values()].map((effect) => ({ ...effect }))
            }))
          }
        : null,
    votes,
    selection: teamUpgrade?.hasSelection === true ? { ...teamUpgrade.selection } : null
  };
}

export function toSpawnOrder<T extends { spawnSequence: number }>(
  collection: ValueCollection<T>
): T[] {
  return [...collection.values()].sort((left, right) => left.spawnSequence - right.spawnSequence);
}

export function toPublicProjectile(projectile: NetworkProjectileState) {
  const base = {
    entityId: projectile.entityId,
    spawnSequence: projectile.spawnSequence,
    kind: projectile.kind,
    x: projectile.x,
    y: projectile.y,
    velocityX: projectile.velocityX,
    velocityY: projectile.velocityY,
    radius: projectile.radius,
    visual: toEntityVisual(projectile.visualShape, projectile.visualScale)
  };
  const source = normalizeProjectileSource(projectile.source);
  return source === undefined ? base : { ...base, source };
}

export function toPublicHomingMissile(missile: NetworkHomingMissileState) {
  return {
    entityId: missile.entityId,
    spawnSequence: missile.spawnSequence,
    x: missile.x,
    y: missile.y,
    velocityX: missile.velocityX,
    velocityY: missile.velocityY,
    radius: missile.radius,
    heading: missile.heading,
    visual: toEntityVisual(missile.visualShape, missile.visualScale)
  };
}

/** The wire spells "no look" as an empty shape, so it never sends a null branch. */
export function toEntityVisual(
  shape: string | undefined,
  modelScale: number | undefined
): { shape: string; modelScale: number } | null {
  if (shape === undefined || shape.length === 0) return null;
  return { shape, modelScale: modelScale ?? 1 };
}

export function normalizeProjectileSource(
  source: string | undefined
): "cannon" | "machineGun" | undefined {
  if (source === "cannon" || source === "machineGun") return source;
  return undefined;
}

/** A preset the display does not ship with falls back to the blue nebula. */
export function toNebulaPreset(preset: string | undefined): NebulaPreset {
  if (preset !== undefined && (NEBULA_PRESETS as readonly string[]).includes(preset)) {
    return preset as NebulaPreset;
  }
  return "blue";
}

export function toPublicLatency(latencyMs: number | undefined): number | null {
  return latencyMs === undefined || latencyMs < 0 ? null : latencyMs;
}

/**
 * The archetype's event effects, as the view carries them.
 *
 * The room has no optional field, so an unset slot arrives as an empty string;
 * the view omits it instead, which is what lets a consumer write
 * `effects?.death ?? fallback` and be done.
 */
export function toEnemyEffects(entry: {
  readonly effectDeath?: string;
  readonly effectHit?: string;
  readonly effectShot?: string;
}): { death?: string; hit?: string; shot?: string } | undefined {
  const chosen = {
    ...(entry.effectDeath === undefined || entry.effectDeath === ""
      ? {}
      : { death: entry.effectDeath }),
    ...(entry.effectHit === undefined || entry.effectHit === "" ? {} : { hit: entry.effectHit }),
    ...(entry.effectShot === undefined || entry.effectShot === "" ? {} : { shot: entry.effectShot })
  };
  return Object.keys(chosen).length === 0 ? undefined : chosen;
}
