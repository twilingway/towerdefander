import { createSpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import { Predict, type Room } from "@colyseus/sdk";
import { SoloInput } from "@spaceship-defender/protocol";
import { useEffect, useRef } from "react";

import {
  createPlaybackDelayEstimate,
  observePatchArrival,
  playbackDelayMs
} from "../playbackDelay.js";
import {
  PREDICTED_POSE_FIELDS,
  stepPredictedPose,
  toShipStats,
  type LiveEntity,
  type LiveEntityKind,
  type LivePlacement,
  type PredictedInputFrame,
  type PredictedPoseFrame,
  type PredictionDriver
} from "../shipPrediction.js";

/**
 * Runs the ship locally and reconciles it with the room.
 *
 * The loop is the one the SDK prescribes and the lab spells out: ask how many
 * fixed steps are due, send exactly that many input frames, and only then read
 * for drawing. Reading between the two is a step stale, and a step stale at
 * twenty hertz is what a hand feels as lag.
 */

/** What the cockpit hands over each frame; the wire shape, already resolved. */
export interface ShipPredictionSource {
  readIntent(): PredictedInputFrame;
  readonly enabled: boolean;
}

export interface ShipPredictionHandle {
  /** The predicted pose to draw, or undefined before the first patch. */
  readPose(): PredictedPoseFrame | undefined;
  /** How many of our own frames the room has not acknowledged yet. */
  readPending(): number;
}

interface DecodedPose extends PredictedPoseFrame {
  readonly $?: unknown;
}

/** One live entity as the decoder hands it over: identity, place, motion. */
interface DecodedEntity {
  readonly entityId: string;
  x: number;
  y: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

/** An entity that steers, and therefore publishes where it is pointing. */
interface DecodedHull extends DecodedEntity {
  readonly heading: number;
}

interface DecodedCollection {
  values(): IterableIterator<DecodedEntity>;
}

interface DecodedDisplay {
  readonly pose?: DecodedPose;
  readonly enemyShips: DecodedCollection;
  readonly asteroids: DecodedCollection;
  readonly lootDrops: DecodedCollection;
  readonly friendlyProjectiles: DecodedCollection;
  readonly hostileProjectiles: DecodedCollection;
  readonly homingMissiles: DecodedCollection;
}

/** Which collections an entity of each kind can be found in. */
const LIVE_COLLECTIONS: Record<LiveEntityKind, readonly (keyof DecodedDisplay)[]> = {
  enemy: ["enemyShips"],
  asteroid: ["asteroids"],
  loot: ["lootDrops"],
  projectile: ["friendlyProjectiles", "hostileProjectiles"],
  missile: ["homingMissiles"]
};

/** The kinds whose bearing is published and therefore interpolated as an angle. */
const LIVE_KINDS_WITH_HEADING = new Set<LiveEntityKind>(["enemy", "missile"]);

type PredictHandle = ReturnType<typeof Predict.get>;

/**
 * The drive numbers and the arena the replay steps with.
 *
 * Read fresh every frame rather than captured once: a module bought mid-run
 * moves them, and a replay against the numbers the ship had an hour ago is the
 * drift this whole mechanism exists to avoid.
 */
export interface PredictionWorld {
  readonly drive: Parameters<typeof toShipStats>[0];
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly arenaRadius: number;
  readonly turretMountedOnHull: boolean;
}

export function useShipPrediction<
  TState extends { game?: { display?: DecodedDisplay | undefined } | undefined }
>({
  room,
  enabled,
  source,
  world,
  predicting,
  onDriver,
  onPending,
  onDelay
}: {
  readonly room: Room<unknown, TState> | undefined;
  /** Whether this display holds a cockpit seat in a running fight. */
  readonly enabled: boolean;
  /** Whether the ship is drawn from the local step or from the room's snapshot. */
  readonly predicting: boolean;
  readonly source: ShipPredictionSource;
  readonly world: PredictionWorld | undefined;
  /**
   * Called every animation frame with the pose to draw.
   *
   * It must NOT set React state. This runs at frame rate, and pushing a new
   * value into a component from here re-renders the whole battle tree sixty to
   * a hundred and sixty times a second - which froze a phone within seconds of
   * the first run and is the very tax prediction is here to remove. Write it to
   * a ref; the scene reads the ref.
   */
  /**
   * Handed the function the scene must call once per drawn frame, or undefined
   * when there is nothing to drive.
   */
  readonly onDriver: (driver: PredictionDriver | undefined) => void;
  /**
   * How deep the replay is: frames we have sent that the room has not
   * acknowledged.
   *
   * The number that tells a healthy prediction from a drowning one. It should
   * sit at a couple of frames - one round trip. Climbing means the room is not
   * spending what we send, and every ack then replays a longer and longer
   * buffer until the device gives up.
   */
  readonly onPending?: (pending: number, driftEma: number) => void;
  /**
   * How far behind the newest snapshot the world is drawn, and the arrival
   * spacing that bought it.
   *
   * Both, because only the pair says which half is wrong: a buffer that looks
   * too short is either a stream that is faster than expected or a counter that
   * is being told about arrivals twice.
   */
  readonly onDelay?: (delayMs: number, intervalMs: number) => void;
}): void {
  const latest = useRef({ source, world, enabled, predicting, onDriver, onPending, onDelay });
  latest.current = { source, world, enabled, predicting, onDriver, onPending, onDelay };

  useEffect(() => {
    if (room === undefined) return undefined;
    try {
      return start();
    } catch (error) {
      /*
       * Prediction is an improvement, never a dependency.
       *
       * It threw once already - the room advertises a wake interval rather than
       * a step - and it took the whole display down with it, because a hook
       * that throws in an effect has no boundary above it. A screen that draws
       * the authoritative ship is a worse screen; a screen that draws nothing
       * is not a screen.
       */
      console.error("Ship prediction is off: it could not start.", error);
      latest.current.onDriver(undefined);
      return undefined;
    }

    function start(): (() => void) | undefined {
      if (room === undefined) return undefined;
      const display = room.state.game?.display;
      const pose = display?.pose;
      if (display === undefined || pose === undefined) return undefined;

      /*
       * The one cast in the file, and it is a boundary rather than a shortcut.
       *
       * This app types room state structurally on purpose - `roomView` never
       * imports the server's schema classes, which is what keeps the display from
       * depending on the room's internals. The predictor, however, works on the
       * decoded tree itself. So the two meet here, once, and everything past this
       * line is typed again.
       */
      /*
       * The buffer starts at one interval's guess and is then measured.
       *
       * Interpolation draws at `now - delay` and needs two snapshots around
       * that moment; on underrun the SDK holds the newest one, which is what an
       * enemy stopping dead and then jumping actually is. Three intervals of
       * slack is what the reference prototype keeps, and it broadcasts every
       * thirty-three milliseconds. Ours arrive further apart and less evenly,
       * so the same slack is a bigger number here - and one nobody should have
       * to guess, because the stream says what it is.
       */
      let delayEstimate = createPlaybackDelayEstimate();
      let publishedDelayMs = playbackDelayMs(delayEstimate);
      const predict: PredictHandle = Predict.get(
        room as unknown as Parameters<typeof Predict.get>[0],
        {
          mode: "lerp",
          delay: publishedDelayMs
        }
      );
      const noteArrival = (): void => {
        delayEstimate = observePatchArrival(delayEstimate, performance.now());
        const wanted = playbackDelayMs(delayEstimate);
        // Moved only when it moved enough to matter: rewriting the profile on
        // every patch would be churn, and the buffer is not a precision
        // instrument.
        if (Math.abs(wanted - publishedDelayMs) < 8) return;
        publishedDelayMs = wanted;
        predict.setDefaults({ delay: wanted });
        latest.current.onDelay?.(wanted, delayEstimate.intervalMs);
      };
      room.onStateChange(noteArrival);
      const input = room.input({ type: SoloInput });
      const reconciler = predict.reconciler(pose, {
        input,
        fields: [...PREDICTED_POSE_FIELDS],
        step: (_ctx, state, command) => {
          const current = latest.current.world;
          if (current === undefined) return;
          stepPredictedPose(
            state,
            command,
            createSpaceshipSimulationConfig({
              worldWidth: current.worldWidth,
              worldHeight: current.worldHeight,
              arenaRadius: current.arenaRadius,
              turretMountedOnHull: current.turretMountedOnHull
            }),
            toShipStats(current.drive)
          );
        },
        // Corrections are eased in rather than snapped. Roughly two thirds of any
        // gap closes per this many milliseconds, which is the price of not seeing
        // the ship jump when the room disagrees.
        smoothMs: 65
      });

      /*
       * One function, called by the scene at the top of the frame it draws.
       *
       * Not a loop of its own: the order - step, send exactly what was stepped,
       * then read - has to happen inside the frame that draws, or the scene reads
       * a pose staged one callback ago, and a step stale is what a hand reads as
       * stutter. The lab states the same order in the same place.
       */
      /*
       * The rest of the world, on the same clock as the ship.
       *
       * Position and bearing are two attaches on purpose. One config applies its
       * `angle` flag to every field it lists, and unwrapping is what folds a hull
       * crossing PI onto the shorter arc instead of spinning it the long way
       * round. Put together, the position glides and the rotation steps at the
       * patch rate - a ship that runs at twenty frames a second while its
       * position does not.
       */
      /*
       * The second boundary cast, and the same reason as the first: this app
       * types room state structurally, while `attachAll` is typed against the
       * schema classes it walks. The keys below are checked against the decoded
       * shape declared above, so a renamed collection still fails to compile.
       */
      const collections = display as unknown as Record<string, never>;
      const detachers = [
        predict.attachAll(collections, "enemyShips", {
          mode: "lerp",
          fields: ["x", "y"]
        }),
        predict.attachAll(collections, "enemyShips", {
          mode: "lerp",
          fields: ["heading"],
          angle: true
        }),
        predict.attachAll(collections, "homingMissiles", {
          mode: "lerp",
          fields: ["x", "y"]
        }),
        predict.attachAll(collections, "homingMissiles", {
          mode: "lerp",
          fields: ["heading"],
          angle: true
        }),
        /*
         * Rocks and salvage drift, and a drift is still someone else's business:
         * they bounce off the hull and off each other, so they are interpolated
         * like anything whose next move is not ours to know.
         */
        predict.attachAll(collections, "asteroids", {
          mode: "lerp",
          fields: ["x", "y"]
        }),
        predict.attachAll(collections, "lootDrops", {
          mode: "lerp",
          fields: ["x", "y"]
        }),
        /*
         * Shells are dead reckoned, and they are the only thing here that earns
         * it. An interpolated entity is drawn between the two newest snapshots,
         * which is to say in the past: at a hundred-millisecond buffer and a
         * thousand units a second, a shell was drawn a hundred units behind
         * where the room had it, which is what "the bullets come out of the
         * wrong place" was. A shell has no driver - constant velocity along a
         * fixed bearing, both already on the wire - so carrying it to server
         * present is arithmetic rather than a guess. Smoothing stays off: a
         * constant-step projectile rebases exactly, and easing it would put back
         * the very lag this removes.
         */
        ...(["friendlyProjectiles", "hostileProjectiles"] as const).map((key) =>
          predict.attachAll(collections, key, {
            mode: "reckon",
            fields: ["x", "y"],
            step: (shell: DecodedEntity & { x: number; y: number }, dt: number) => {
              shell.x += shell.velocityX * dt;
              shell.y += shell.velocityY * dt;
            },
            smoothMs: 0
          })
        )
      ];

      const bind = (entityId: string, kind: LiveEntityKind): LiveEntity | undefined => {
        for (const key of LIVE_COLLECTIONS[kind]) {
          const collection = display[key] as DecodedCollection;
          for (const candidate of collection.values()) {
            if (candidate.entityId === entityId) return { ref: candidate, kind };
          }
        }
        return undefined;
      };

      /*
       * One object, handed out again and again.
       *
       * This is called for every entity on every drawn frame, and a fresh
       * object each time is a few hundred a second on a full field - small
       * enough to look free and exactly the shape of a collection pause, which
       * arrives as the odd long frame in an otherwise even second. The caller
       * reads it before asking for the next one, which is the only contract a
       * shared scratch needs.
       */
      const placement = { x: 0, y: 0, rotation: 0 };
      const drawnPose = {
        x: 0,
        y: 0,
        velocityX: 0,
        velocityY: 0,
        heading: 0,
        turretAngle: 0
      } as PredictedPoseFrame;
      const read = (entity: LiveEntity): LivePlacement => {
        const ref = entity.ref as DecodedEntity;
        placement.x = predict.value(ref, "x");
        placement.y = predict.value(ref, "y");
        // A shell publishes no bearing because it does not need one: it points
        // where it is going, and that never changes while it flies.
        placement.rotation = LIVE_KINDS_WITH_HEADING.has(entity.kind)
          ? predict.value(ref as DecodedHull, "heading")
          : Math.atan2(ref.velocityY, ref.velocityX);
        return placement;
      };

      let seq = 0;
      let lastDrivenAt = 0;
      const drive = (): PredictedPoseFrame | undefined => {
        lastDrivenAt = performance.now();
        const steps = predict.tick();
        const { source: live, enabled: on, predicting, world } = latest.current;
        for (let step = 0; step < steps; step += 1) {
          if (!on) break;
          Object.assign(input.data, live.readIntent());
          /*
           * The stamp is ours to write.
           *
           * The room dedupes on it and acks by it, and a frame that never
           * carries one is acknowledged as zero forever: the room applies every
           * frame, agrees with every frame, and the client still counts them all
           * as in flight, because nothing it sent was ever confirmed. The drive
           * revision rides along for the same reason the lab sends its profile
           * index - a replay has to use the numbers that produced the frame, and
           * ours move whenever a module is bought.
           */
          input.data.seq = ++seq;
          input.data.driveRevision = world?.drive.revision ?? 0;
          input.send();
        }
        latest.current.onPending?.(input.pendingCount, reconciler.drift.ema);
        /*
         * The switch stops the prediction, not the stream.
         *
         * There is one input path for a cockpit and it is this one: the frames
         * go out either way, and turning prediction off only stops the scene
         * from being handed a locally stepped pose, so it draws the room's. A
         * switch that changed which protocol carries the input would compare two
         * different games, and the run with it off had no helm at all.
         */
        if (!predicting) return undefined;
        /*
         * Position through `value()`, bearings straight from the state.
         *
         * The step runs twenty times a second; read raw it draws twenty positions
         * a second and nothing between them, which is why prediction looked
         * jerkier than the interpolation it replaced. Bearings must not go
         * through it: it interpolates numerically, and a value crossing PI would
         * take the long way round every time.
         */
        // The same scratch as the placements above, and for the same reason: a
        // pose spread into a new object every frame is a pose allocated sixty
        // times a second to be read once.
        const state = reconciler.state as PredictedPoseFrame;
        drawnPose.x = reconciler.value("x");
        drawnPose.y = reconciler.value("y");
        drawnPose.heading = state.heading;
        drawnPose.turretAngle = state.turretAngle;
        drawnPose.velocityX = state.velocityX;
        drawnPose.velocityY = state.velocityY;
        return drawnPose;
      };
      latest.current.onDriver({ drive, bind, read });

      /*
       * A driver of last resort, for the seconds before there is a scene.
       *
       * The frame order belongs in the scene - step, send exactly what was
       * stepped, then read - but the scene is Phaser, and Phaser arrives in its
       * own chunk. On a phone that is about a second after the fight starts,
       * and for that second nothing called the driver at all: no input frames
       * left the cockpit, so the first shots vanished, the heat never rose and
       * the ship would not answer the stick. Whatever the cause of a gap - a
       * chunk still loading, a tab in the background, a scene being rebuilt -
       * the helm is not allowed to stop.
       *
       * It stands down the moment the scene takes over: one frame of overlap
       * would be one input frame too many.
       */
      const STALE_DRIVE_MS = 40;
      let fallbackFrame = 0;
      const runFallback = (): void => {
        fallbackFrame = requestAnimationFrame(runFallback);
        if (performance.now() - lastDrivenAt < STALE_DRIVE_MS) return;
        drive();
      };
      fallbackFrame = requestAnimationFrame(runFallback);

      return () => {
        cancelAnimationFrame(fallbackFrame);
        latest.current.onDriver(undefined);
        room.onStateChange.remove(noteArrival);
        for (const detach of detachers) detach();
      };
    }
  }, [room]);
}
