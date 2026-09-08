import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { useEffect, useRef, useState } from "react";

import { getCurrentWaveUpgrade } from "../../model/combatHudViewModel.js";
import { readPixelRatioCap } from "../../game/devicePixels.js";
import { nextPixelRatioCap, PIXEL_RATIO_FALLBACK_SAMPLES } from "../../game/spaceshipViewModel.js";
import type { SpaceshipRuntime } from "../../game/SpaceshipRuntime.js";
import type { PredictionDriver } from "../../model/shipPrediction.js";
import {
  findNearestVisibleDemoTarget,
  findNearestVisibleDemoThreat
} from "../../model/visibleDemo.js";

interface SpaceshipCanvasProps {
  readonly game: DisplayGameSnapshot;
  readonly runNumber: number;
  readonly connectionEpoch: number;
  readonly visibleDemo?: boolean;
  /**
   * How the scene is running, sampled here because this is where the loop is,
   * and read out in the header because that is where a player looks for it.
   * The average and the worst frame answer different questions, so both travel.
   */
  readonly onFrameStats?: (stats: {
    readonly fps: number;
    /** The mean frame of the last second, beside the worst one. */
    readonly averageFrameMs: number;
    readonly worstFrameMs: number;
    readonly stutterShare: number;
    /** What the Phaser scene's own per-frame work costs, over the last second. */
    readonly updateMsPerSecond: number;
    readonly worstUpdateMs: number;
    /** Of the entities drawn, how many were read off the predictor. */
    readonly liveDrawn: number;
    /** And how many of them sat outside the camera. */
    readonly offscreen: number;
  }) => void;
  /**
   * Parallax layers on or off. A question rather than a setting: four
   * full-screen tile sprites, three of them blended, are a plausible way to
   * spend a phone's fill rate, and the only way to know is to take them away on
   * the phone that stutters.
   */
  /** The shield's bloom, the other thing worth ruling out on a phone. */
  /** The vector overlays rebuilt every frame - the last thing left to price. */
  readonly vectorsEnabled?: boolean;
  /**
   * The ship this page is flying, read once per drawn frame.
   *
   * A reader rather than a value: the pose changes every frame, and handing it
   * down as a prop would mean a React render every frame - which is the tax the
   * prediction exists to remove, not to double.
   */
  readonly prediction?: PredictionDriver | undefined;
  /**
   * The newest snapshot there is, read by the scene at the top of each frame.
   *
   * Given one, the `game` prop stops being how the world reaches the scene and
   * becomes only what this component renders around it - which is what lets the
   * page commit on a slower clock than the room patches on.
   */
  readonly readGame?: (() => DisplayGameSnapshot | undefined) | undefined;
}

/** Twice a second: faster than this and the digits blur into noise. */
const FPS_SAMPLE_INTERVAL_MS = 500;
/** The world as text, for tests and the demo bot; nothing on screen reads it. */
const READABLE_SAMPLE_INTERVAL_MS = 100;

/**
 * The world as text: what a browser test and the demo bot read off the arena.
 *
 * Gathered in one place because two paths need exactly the same set - React
 * spreads it on the first render, and a timer writes it straight to the node
 * afterwards. Written imperatively rather than through state on purpose: the
 * page holds still during combat, and re-rendering this div ten times a second
 * to move a number no one looks at was measurable - eleven commits a second
 * where the rest of the page manages three.
 */
function worldAttributes(
  game: DisplayGameSnapshot,
  runNumber: number,
  visibleDemo: boolean
): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-run-number": String(runNumber),
    "data-arena-radius": String(game.arenaRadius),
    "data-world-width": String(game.worldWidth),
    "data-world-height": String(game.worldHeight),
    "data-spaceship-x": String(game.spaceship.x),
    "data-spaceship-y": String(game.spaceship.y),
    "data-spaceship-radius": String(game.spaceship.radius),
    "data-spaceship-velocity-x": String(game.spaceship.velocityX),
    "data-spaceship-heading": String(game.spaceship.heading),
    "data-spaceship-hp": String(game.spaceship.hp),
    "data-spaceship-max-hp": String(game.spaceship.maxHp),
    "data-score": String(game.encounter.score),
    "data-credits": String(game.credits),
    "data-wave-number": String(game.encounter.waveNumber),
    "data-encounter-phase": game.encounter.phase,
    "data-team-upgrade-id":
      getCurrentWaveUpgrade(game.teamUpgrade.selection, game.encounter.waveNumber)?.upgradeId ?? "",
    "data-turret-angle": String(game.turretAngle),
    "data-enemy-count": String(game.enemyShips.length),
    "data-asteroid-count": String(game.asteroids.length),
    "data-friendly-projectile-count": String(game.friendlyProjectiles.length),
    "data-mg-projectile-count": String(
      game.friendlyProjectiles.filter((projectile) => projectile.source === "machineGun").length
    ),
    "data-hostile-projectile-count": String(game.hostileProjectiles.length),
    "data-missile-count": String(game.homingMissiles.length),
    "data-latest-projectile-id": game.friendlyProjectiles.at(-1)?.entityId ?? "",
    "data-shield-active": String(game.shield.active),
    "data-shield-angle": String(game.shield.angle),
    "data-shield-energy": String(game.shield.energy)
  };
  if (!visibleDemo) return attributes;
  const target = findNearestVisibleDemoTarget(game);
  const threat = findNearestVisibleDemoThreat(game);
  attributes["data-demo-target-id"] = target?.entityId ?? "";
  attributes["data-demo-target-x"] = String(target?.x ?? "");
  attributes["data-demo-target-y"] = String(target?.y ?? "");
  attributes["data-demo-target-velocity-x"] = String(target?.velocityX ?? "");
  attributes["data-demo-target-velocity-y"] = String(target?.velocityY ?? "");
  attributes["data-demo-threat-id"] = threat?.entityId ?? "";
  attributes["data-demo-threat-x"] = String(threat?.x ?? "");
  attributes["data-demo-threat-y"] = String(threat?.y ?? "");
  attributes["data-demo-threat-velocity-x"] = String(threat?.velocityX ?? "");
  attributes["data-demo-threat-velocity-y"] = String(threat?.velocityY ?? "");
  return attributes;
}

export function SpaceshipCanvas({
  game,
  runNumber,
  connectionEpoch,
  visibleDemo = false,
  vectorsEnabled = true,
  prediction,
  readGame,
  onFrameStats
}: SpaceshipCanvasProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const runtimeReference = useRef<SpaceshipRuntime | undefined>(undefined);
  const latestGame = useRef(game);
  const latestVectorsEnabled = useRef(vectorsEnabled);
  latestVectorsEnabled.current = vectorsEnabled;
  const latestPrediction = useRef(prediction);
  latestPrediction.current = prediction;
  const latestReadGame = useRef(readGame);
  latestReadGame.current = readGame;
  const latestRunNumber = useRef(runNumber);
  const latestConnectionEpoch = useRef(connectionEpoch);
  const lastRuntimeTickReference = useRef(game.tick);
  const lastRuntimeCameraViewWidthReference = useRef(game.cameraViewWidth);
  const lastRuntimeRunNumberReference = useRef(runNumber);
  const lastRuntimeConnectionEpochReference = useRef(connectionEpoch);
  const [failed, setFailed] = useState(false);
  latestGame.current = game;
  latestRunNumber.current = runNumber;
  latestConnectionEpoch.current = connectionEpoch;

  useEffect(() => {
    let disposed = false;
    const host = hostReference.current;
    if (host === null) return;

    void import("../../game/SpaceshipRuntime.js")
      .then(({ createSpaceshipRuntime }) => {
        if (!disposed) {
          runtimeReference.current = createSpaceshipRuntime(host, latestGame.current, {
            pixelRatioCap: pixelRatioCap.current
          });
          // The scene loads asynchronously, so the switch may already have been
          // thrown while it was still arriving.
          runtimeReference.current.setVectorsEnabled(latestVectorsEnabled.current);
          // A stable adapter over a prop that changes: the scene is handed this
          // once, and every call finds whatever the cockpit currently has.
          runtimeReference.current.setSnapshotSource(() => latestReadGame.current?.());
          runtimeReference.current.setPredictionDriver({
            drive: () => latestPrediction.current?.drive(),
            bind: (entityId, kind) => latestPrediction.current?.bind(entityId, kind),
            read: (entity) => latestPrediction.current?.read(entity)
          });
          lastRuntimeTickReference.current = latestGame.current.tick;
          lastRuntimeCameraViewWidthReference.current = latestGame.current.cameraViewWidth;
          lastRuntimeRunNumberReference.current = latestRunNumber.current;
          lastRuntimeConnectionEpochReference.current = latestConnectionEpoch.current;
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      runtimeReference.current?.destroy();
      runtimeReference.current = undefined;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeReference.current;
    if (runtime === undefined) return;

    const shouldHydrate = shouldPrepareRuntimeHydration(
      lastRuntimeRunNumberReference.current,
      runNumber,
      lastRuntimeConnectionEpochReference.current,
      connectionEpoch
    );
    if (shouldHydrate) {
      prepareRuntimeHydration(runtime, game);
    } else if (
      shouldUpdateRuntime(lastRuntimeTickReference.current, game.tick) ||
      shouldReframeRuntime(lastRuntimeCameraViewWidthReference.current, game.cameraViewWidth)
    ) {
      // Only when nobody is feeding the scene from the wire. With a reader
      // installed this render is already behind what the scene has drawn, and
      // pushing it again would walk the world backwards.
      if (readGame === undefined) runtime.update(game);
    } else {
      return;
    }

    lastRuntimeTickReference.current = game.tick;
    lastRuntimeCameraViewWidthReference.current = game.cameraViewWidth;
    lastRuntimeRunNumberReference.current = runNumber;
    lastRuntimeConnectionEpochReference.current = connectionEpoch;
  }, [connectionEpoch, game, readGame, runNumber]);

  useEffect(() => {
    runtimeReference.current?.setVectorsEnabled(vectorsEnabled);
  }, [vectorsEnabled]);

  const onFrameStatsReference = useRef(onFrameStats);
  onFrameStatsReference.current = onFrameStats;
  const fpsWindow = useRef<number[]>([]);
  // Read at render, and the component tests render without a document at all -
  // the types say `location` is always there, the renderer says otherwise.
  const pixelRatioCap = useRef(
    readPixelRatioCap((globalThis as { location?: { search?: string } }).location?.search ?? "")
  );
  useEffect(() => {
    const sample = () => {
      const fps = runtimeReference.current?.readFps() ?? 0;
      onFrameStatsReference.current?.({
        fps,
        averageFrameMs: runtimeReference.current?.readAverageFrameMs() ?? 0,
        worstFrameMs: runtimeReference.current?.readWorstFrameMs() ?? 0,
        stutterShare: runtimeReference.current?.readStutterShare() ?? 0,
        updateMsPerSecond: runtimeReference.current?.readUpdateMsPerSecond() ?? 0,
        worstUpdateMs: runtimeReference.current?.readWorstUpdateMs() ?? 0,
        liveDrawn: runtimeReference.current?.readLiveDrawnCount() ?? 0,
        offscreen: runtimeReference.current?.readOffscreenCount() ?? 0
      });
      // Down only, and only on a run of samples: a wave that briefly puts forty
      // ships on the field is not a phone that cannot run the game.
      const window = fpsWindow.current;
      window.push(fps);
      if (window.length > PIXEL_RATIO_FALLBACK_SAMPLES) window.shift();
      const next = nextPixelRatioCap(pixelRatioCap.current, window);
      if (next !== pixelRatioCap.current) {
        pixelRatioCap.current = next;
        window.length = 0;
        runtimeReference.current?.setPixelRatioCap(next);
      }
    };
    const timer = globalThis.setInterval(sample, FPS_SAMPLE_INTERVAL_MS);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, []);

  /*
   * The readable state of the world, on its own slow clock.
   *
   * These attributes are how a browser test and the demo bot see the arena, and
   * they used to come from the `game` prop - which was fine while every patch
   * re-rendered the page. It no longer does: in combat the page holds still and
   * the scene draws from the live reader, so an attribute rendered from the
   * prop would sit frozen at whatever the last structural change left behind.
   *
   * Ten times a second is far below the patch rate and far above anything a
   * test waits for, and the subtree it re-renders is this div and one hidden
   * sentence.
   */
  const shellReference = useRef<HTMLDivElement | null>(null);
  /*
   * The world as text exists for the things that cannot read a canvas: the
   * browser suite and the demo bot. Neither of them is a player, so a release
   * build carries neither the element nor the timer that moves it. Both
   * harnesses serve the display from a dev server, and the demo sets its own
   * flag on top of that.
   */
  const readableWorld = import.meta.env.DEV || visibleDemo;
  useEffect(() => {
    if (!readableWorld || readGame === undefined) return undefined;
    const timer = globalThis.setInterval(() => {
      const latest = readGame();
      const element = shellReference.current;
      if (latest === undefined || element === null) return;
      for (const [name, value] of Object.entries(worldAttributes(latest, runNumber, visibleDemo))) {
        if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      }
    }, READABLE_SAMPLE_INTERVAL_MS);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [readGame, readableWorld, runNumber, visibleDemo]);

  /*
   * Three branches, and the canvas is the first of them with nothing above it
   * that changes.
   *
   * The reference prototype's page is `#game`, `#touch-layer`, `#hud` as
   * siblings, and that shape is not cosmetic: an attribute written on an
   * ancestor of a canvas invalidates style for the subtree it is in, and the
   * arena's readable state is written ten times a second. It used to be written
   * on the canvas's own parent.
   */
  return (
    <>
      <div ref={hostReference} className="battlefield-canvas" aria-hidden="true" />
      {failed && <p className="battlefield-fallback">Не удалось запустить Phaser-сцену.</p>}
      {/*
        The world as text, on an element of its own: a browser test and the demo
        bot read it, nothing draws it, and it has no children to invalidate.
      */}
      {readableWorld && (
        <div
          ref={shellReference}
          className="battlefield-shell"
          data-testid="spaceship-world"
          {...worldAttributes(game, runNumber, visibleDemo)}
        >
          <span className="sr-only">
            Корабль находится в точке {Math.round(game.spaceship.x)}, {Math.round(game.spaceship.y)}
            . Снарядов: {game.friendlyProjectiles.length + game.hostileProjectiles.length}. Врагов:{" "}
            {game.enemyShips.length}.
          </span>
        </div>
      )}
    </>
  );
}

export function shouldUpdateRuntime(previousTick: number, nextTick: number): boolean {
  return previousTick !== nextTick;
}

/**
 * The preview holds one fixture tick still while its camera slider moves, so a
 * reframed snapshot has to reach the runtime on its own.
 */
export function shouldReframeRuntime(
  previousCameraViewWidth: number,
  nextCameraViewWidth: number
): boolean {
  return previousCameraViewWidth !== nextCameraViewWidth;
}

export function shouldPrepareRuntimeHydration(
  previousRunNumber: number,
  nextRunNumber: number,
  previousConnectionEpoch: number,
  nextConnectionEpoch: number
): boolean {
  return previousRunNumber !== nextRunNumber || previousConnectionEpoch !== nextConnectionEpoch;
}

export function prepareRuntimeHydration(
  runtime: SpaceshipRuntime,
  snapshot: DisplayGameSnapshot
): void {
  runtime.prepareHydration();
  runtime.update(snapshot);
}
