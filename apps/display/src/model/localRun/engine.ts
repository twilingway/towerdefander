import {
  createCrewPolicyOptions,
  createLocalMirror,
  createRunSeed,
  driveCrewSeats,
  publishEnemyCatalogue,
  toHelmView,
  armWaveDeadline,
  extendForSalvage,
  isWaveExpired,
  waveSecondsRemaining,
  PLAIN_PROJECTION_FACTORIES,
  POLICY_TICK_MS,
  projectGameState,
  type LocalMirror,
  type PolicyMemory,
  type PolicyOptions,
  type WaveDeadline
} from "@spaceship-defender/game-runtime";
import {
  createAutopilotMemory,
  resolveAutopilotProfile
} from "@spaceship-defender/game-runtime/crewPolicy.mjs";
import {
  advanceSpaceshipSimulation,
  applyGunnerInput,
  applyPilotInput,
  createCleanSpaceshipRun,
  failWaveByTimeout,
  voteForTeamUpgrade,
  type SpaceshipSimulationConfig,
  type SpaceshipSimulationState,
  type UpgradeVoteCommand
} from "@spaceship-defender/game-core";
import type { AutopilotProfile, BalanceTuning } from "@spaceship-defender/protocol";

import { DECORATION_REFERENCE_WORLD, DECORATIVE_OBSTACLES } from "@spaceship-defender/game-runtime";

/**
 * A campaign run hosted by this tab.
 *
 * Everything a room does around the step, minus what only a room can mean. The
 * simulation, the projection and the crew policy are the same code the server
 * runs; what is written here is the part a host owns: when to step, what the
 * player is holding down, and how long the wave has left.
 */

/** What the cockpit is asking for this step; the shape its own reader returns. */
export interface LocalIntent {
  readonly vector: { readonly x: number; readonly y: number };
  readonly turn: number | null;
  readonly thrust: number | null;
  readonly mgFiring: boolean;
  readonly aim: { readonly x: number; readonly y: number };
  readonly aimTurn: number | null;
  readonly firing: boolean;
}

export const IDLE_INTENT: LocalIntent = {
  vector: { x: 0, y: 0 },
  turn: null,
  thrust: null,
  mgFiring: false,
  aim: { x: 0, y: 0 },
  aimTurn: null,
  firing: false
};

export interface LocalRunOptions {
  readonly config: SpaceshipSimulationConfig;
  readonly tuning: BalanceTuning;
  readonly shipArchetypeId: string;
  readonly playerName: string;
  readonly startWave: number;
  readonly waveTtlSeconds: number;
}

export interface LocalRun {
  readonly mirror: LocalMirror;
  readonly config: SpaceshipSimulationConfig;
  /** Advances one fixed step with the intent the hand is holding. */
  readonly step: (intent: LocalIntent) => void;
  /** Writes the current frame into the mirror; the caller publishes it. */
  readonly project: (stepCostMs: number) => void;
  readonly vote: (command: UpgradeVoteCommand) => void;
  readonly restart: () => void;
  readonly state: () => SpaceshipSimulationState;
}

/** The slack a salvage window gets beyond its own ticks, as the room gives it. */
const SALVAGE_SLACK_TICKS = 120;

export function createLocalRun(options: LocalRunOptions): LocalRun {
  const { config, tuning, shipArchetypeId, playerName, startWave, waveTtlSeconds } = options;
  const mirror = createLocalMirror();
  const policyOptions: PolicyOptions = createCrewPolicyOptions(config);
  const profile: AutopilotProfile | undefined = resolveAutopilotProfile(
    tuning.autopilot,
    tuning.autopilot.level,
    config.cannonWeaponKind
  );

  let game: SpaceshipSimulationState;
  let memory: PolicyMemory;
  let deadline: WaveDeadline;
  let runNumber = 0;
  let previousSeed: number | undefined;

  function start(): void {
    const seed = createRunSeed(previousSeed);
    previousSeed = seed;
    memory = createAutopilotMemory(seed);
    game = createCleanSpaceshipRun(config, seed, startWave);
    deadline = armWaveDeadline(game.clock.tick, waveTtlSeconds, config.fixedStepMs);
    runNumber += 1;

    mirror.roomId = "LOCAL";
    mirror.phase = "active";
    mirror.runNumber = runNumber;
    mirror.crewSize = 1;
    mirror.shipArchetypeId = shipArchetypeId;
    mirror.hasGame = true;
    mirror.players = new Map([
      [
        "local-pilot",
        {
          playerId: "local-pilot",
          playerName,
          role: "pilot" as const,
          ready: true,
          connected: true,
          latencyMs: -1
        }
      ]
    ]);
    Object.assign(mirror.game.helm, toHelmView(tuning, config));
    publishEnemyCatalogue(mirror.game.display, config, () => ({
      kind: "",
      label: "",
      shape: "",
      modelScale: 1,
      showHealthBar: false,
      isBoss: false,
      effectDeath: "",
      effectHit: "",
      effectShot: "",
      soundDeath: "",
      soundHit: "",
      soundShot: ""
    }));
    initializeDecorations();
  }

  function initializeDecorations(): void {
    const scale = config.worldWidth / DECORATION_REFERENCE_WORLD;
    mirror.game.display.obstacles = DECORATIVE_OBSTACLES.map((obstacle) => ({
      obstacleId: obstacle.obstacleId,
      kind: obstacle.kind,
      x: obstacle.x * scale,
      y: obstacle.y * scale,
      width: "width" in obstacle ? obstacle.width * scale : 0,
      height: "height" in obstacle ? obstacle.height * scale : 0,
      radius: "radius" in obstacle ? obstacle.radius * scale : 0,
      rotation:
        "rotation" in obstacle && typeof obstacle.rotation === "number" ? obstacle.rotation : 0
    }));
  }

  start();

  return {
    mirror,
    config,
    state: () => game,

    step(intent) {
      if (game.outcome !== null) return;

      const tick = game.clock.tick;
      game = applyPilotInput(game, {
        vector: intent.vector,
        turn: intent.turn,
        thrust: intent.thrust,
        mgFiring: intent.mgFiring,
        receivedTick: tick
      });
      game = applyGunnerInput(game, {
        vector: intent.aim,
        turn: intent.aimTurn,
        firing: intent.firing,
        receivedTick: tick
      });

      /*
       * Only the shield. A crew of one owns the pilot seat, and the gunner's
       * stream belongs to that same seat - which is why the room asks who owns
       * the input rather than which seats exist. Handing the bot the turret here
       * would have it fight the player for the panel they aim from.
       */
      if (profile !== undefined && game.encounterPhase === "combat") {
        game = driveCrewSeats(game, config, {
          seats: ["shield"],
          policyTickMs: POLICY_TICK_MS,
          profile,
          memory,
          options: policyOptions
        });
      }

      if (isWaveExpired(deadline, game.clock.tick) && game.encounterPhase === "combat") {
        game = failWaveByTimeout(game);
      }

      const wasWave = game.waveNumber;
      game = advanceSpaceshipSimulation(game, config);
      if (game.waveNumber !== wasWave && game.encounterPhase === "combat") {
        deadline = armWaveDeadline(game.clock.tick, waveTtlSeconds, config.fixedStepMs);
      }
      if (game.lootWindowTicksRemaining > 0) {
        deadline = extendForSalvage(
          deadline,
          game.clock.tick,
          game.lootWindowTicksRemaining,
          SALVAGE_SLACK_TICKS
        );
      }
    },

    project(stepCostMs) {
      projectGameState(
        mirror.game,
        game,
        config,
        waveSecondsRemaining(deadline, game.clock.tick, config.fixedStepMs),
        PLAIN_PROJECTION_FACTORIES
      );
      // Not part of the projection: it measures the host, and on a device the
      // host is this tab. The panel's "server step" becomes the local one.
      mirror.game.display.serverStepMs = stepCostMs;
      mirror.game.display.appliedInputSeq = 0;
    },

    vote(command) {
      const result = voteForTeamUpgrade(game, command);
      if (result.status === "accepted") game = result.state;
    },

    restart() {
      start();
    }
  };
}
