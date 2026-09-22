import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import type { BalanceTuning } from "@spaceship-defender/protocol";

import { leadSpeedFor } from "./crewPolicy.mjs";
import type { PolicyOptions } from "./crewPolicy.d.mts";

/**
 * What a run needs beside its configuration, for whoever is hosting it.
 *
 * Two hosts start the same run now - the room and a device - and both have to
 * hand the policy the same numbers and publish the same helm. Written twice,
 * they would drift the way the autopilot loop did.
 */

/** What the bot is told about the ship it is flying and the field it is on. */
export function createCrewPolicyOptions(config: SpaceshipSimulationConfig): PolicyOptions {
  return {
    archetypes: config.enemyArchetypes,
    cannonSpeed: leadSpeedFor(config.cannonWeaponKind, config.projectileSpeedPerSecond),
    mgSpeed: leadSpeedFor(config.mgWeaponKind, config.mgProjectileSpeedPerSecond),
    turretRate: config.turretMaxAngularSpeedPerSecond,
    shieldRaiseRange: config.shieldAutopilotRaiseRange,
    shieldDrain: config.shieldDrainPerSecond
  };
}

export interface HelmView {
  scheme: BalanceTuning["helm"]["scheme"];
  headingLeadRadians: number;
  stopDampening: number;
  rotateInPlaceThrottle: number;
  hullAngularBrakingPerSecondSquared: number;
  hullAngularMaxSpeed: number;
  hullAngularAcceleration: number;
  turretAngularMaxSpeed: number;
  turretAngularAcceleration: number;
  turretAngularBraking: number;
  turretMountedOnHull: boolean;
  driveDeadzoneShare: number;
  aimDeadzoneShare: number;
  driveZoneShare: number;
  aimProjectionShare: number;
  headingDeadbandRadians: number;
  headingFilterSeconds: number;
  turretLeadRadians: number;
}

/**
 * The helm a panel steers by: the operator's feel settings from the preset,
 * plus the drive numbers the run actually has.
 *
 * Half of it comes from the tuning and half from the config on purpose. The
 * feel is the operator's choice; the rates are the ship's, and a module that
 * buys a faster traverse has to move the helm with it or the panel would steer
 * against numbers the hull no longer has.
 */
export function toHelmView(tuning: BalanceTuning, config: SpaceshipSimulationConfig): HelmView {
  return {
    scheme: tuning.helm.scheme,
    headingLeadRadians: tuning.helm.headingLeadRadians,
    stopDampening: tuning.helm.stopDampening,
    rotateInPlaceThrottle: tuning.helm.rotateInPlaceThrottle,
    driveDeadzoneShare: tuning.helm.driveDeadzoneShare,
    aimDeadzoneShare: tuning.helm.aimDeadzoneShare,
    driveZoneShare: tuning.helm.driveZoneShare,
    aimProjectionShare: tuning.helm.aimProjectionShare,
    headingDeadbandRadians: tuning.helm.headingDeadbandRadians,
    headingFilterSeconds: tuning.helm.headingFilterSeconds,
    turretLeadRadians: tuning.helm.turretLeadRadians,
    hullAngularBrakingPerSecondSquared: config.headingAngularBrakingPerSecondSquared,
    hullAngularMaxSpeed: config.headingMaxAngularSpeedPerSecond,
    hullAngularAcceleration: config.headingAngularAccelerationPerSecondSquared,
    turretAngularMaxSpeed: config.turretMaxAngularSpeedPerSecond,
    turretAngularAcceleration: config.turretAngularAccelerationPerSecondSquared,
    turretAngularBraking: config.turretAngularBrakingPerSecondSquared,
    turretMountedOnHull: config.turretMountedOnHull
  };
}
