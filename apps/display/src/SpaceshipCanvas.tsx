import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import { useEffect, useRef, useState } from "react";

import { getCurrentWaveUpgrade } from "./combatHudViewModel.js";
import type { SpaceshipRuntime } from "./game/SpaceshipRuntime.js";
import {
  buildVisibleDemoWorld,
  findNearestVisibleDemoTarget,
  findNearestVisibleDemoThreat,
  publishVisibleDemoWorld
} from "./visibleDemo.js";

interface SpaceshipCanvasProps {
  readonly game: DisplayGameSnapshot;
  readonly runNumber: number;
  readonly connectionEpoch: number;
  readonly visibleDemo?: boolean;
}

export function SpaceshipCanvas({
  game,
  runNumber,
  connectionEpoch,
  visibleDemo = false
}: SpaceshipCanvasProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const runtimeReference = useRef<SpaceshipRuntime | undefined>(undefined);
  const latestGame = useRef(game);
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
  const demoTarget = visibleDemo ? findNearestVisibleDemoTarget(game) : undefined;
  const demoThreat = visibleDemo ? findNearestVisibleDemoThreat(game) : undefined;

  useEffect(() => {
    let disposed = false;
    const host = hostReference.current;
    if (host === null) return;

    void import("./game/SpaceshipRuntime.js")
      .then(({ createSpaceshipRuntime }) => {
        if (!disposed) {
          runtimeReference.current = createSpaceshipRuntime(host, latestGame.current);
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
      runtime.update(game);
    } else {
      return;
    }

    lastRuntimeTickReference.current = game.tick;
    lastRuntimeCameraViewWidthReference.current = game.cameraViewWidth;
    lastRuntimeRunNumberReference.current = runNumber;
    lastRuntimeConnectionEpochReference.current = connectionEpoch;
  }, [connectionEpoch, game, runNumber]);

  useEffect(() => {
    // Demo-only: the Node bot reads this instead of scraping the render path.
    if (!visibleDemo) return;
    publishVisibleDemoWorld(globalThis, buildVisibleDemoWorld(game, Date.now()));
  }, [game, visibleDemo]);

  return (
    <div
      className="battlefield-shell"
      data-testid="spaceship-world"
      data-run-number={runNumber}
      data-arena-radius={game.arenaRadius}
      data-world-width={game.worldWidth}
      data-world-height={game.worldHeight}
      data-spaceship-x={game.spaceship.x}
      data-spaceship-y={game.spaceship.y}
      data-spaceship-radius={game.spaceship.radius}
      data-spaceship-velocity-x={game.spaceship.velocityX}
      data-spaceship-hp={game.spaceship.hp}
      data-spaceship-max-hp={game.spaceship.maxHp}
      data-score={game.encounter.score}
      data-credits={game.credits}
      data-wave-number={game.encounter.waveNumber}
      data-encounter-phase={game.encounter.phase}
      data-team-upgrade-id={
        getCurrentWaveUpgrade(game.teamUpgrade.selection, game.encounter.waveNumber)?.upgradeId ??
        ""
      }
      data-turret-angle={game.turretAngle}
      data-enemy-count={game.enemyShips.length}
      data-asteroid-count={game.asteroids.length}
      data-friendly-projectile-count={game.friendlyProjectiles.length}
      data-mg-projectile-count={
        game.friendlyProjectiles.filter((projectile) => projectile.source === "machineGun").length
      }
      data-hostile-projectile-count={game.hostileProjectiles.length}
      data-missile-count={game.homingMissiles.length}
      data-latest-projectile-id={game.friendlyProjectiles.at(-1)?.entityId ?? ""}
      data-shield-active={game.shield.active}
      data-shield-angle={game.shield.angle}
      data-shield-energy={game.shield.energy}
      {...(visibleDemo
        ? {
            "data-demo-target-id": demoTarget?.entityId ?? "",
            "data-demo-target-x": demoTarget?.x ?? "",
            "data-demo-target-y": demoTarget?.y ?? "",
            "data-demo-target-velocity-x": demoTarget?.velocityX ?? "",
            "data-demo-target-velocity-y": demoTarget?.velocityY ?? "",
            "data-demo-threat-id": demoThreat?.entityId ?? "",
            "data-demo-threat-x": demoThreat?.x ?? "",
            "data-demo-threat-y": demoThreat?.y ?? "",
            "data-demo-threat-velocity-x": demoThreat?.velocityX ?? "",
            "data-demo-threat-velocity-y": demoThreat?.velocityY ?? ""
          }
        : {})}
    >
      <div ref={hostReference} className="battlefield-canvas" aria-hidden="true" />
      {failed && <p className="battlefield-fallback">Не удалось запустить Phaser-сцену.</p>}
      <span className="sr-only">
        Корабль находится в точке {Math.round(game.spaceship.x)}, {Math.round(game.spaceship.y)}.
        Снарядов: {game.friendlyProjectiles.length + game.hostileProjectiles.length}. Врагов:{" "}
        {game.enemyShips.length}.
      </span>
    </div>
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
