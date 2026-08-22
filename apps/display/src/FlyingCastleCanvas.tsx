import type { DisplayGameSnapshot } from "@town-defenders/protocol";
import { useEffect, useRef, useState } from "react";

import type { FlyingCastleRuntime } from "./game/FlyingCastleRuntime.js";

interface FlyingCastleCanvasProps {
  readonly game: DisplayGameSnapshot;
  readonly runNumber: number;
  readonly connectionEpoch: number;
}

export function FlyingCastleCanvas({ game, runNumber, connectionEpoch }: FlyingCastleCanvasProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const runtimeReference = useRef<FlyingCastleRuntime | undefined>(undefined);
  const latestGame = useRef(game);
  const latestRunNumber = useRef(runNumber);
  const latestConnectionEpoch = useRef(connectionEpoch);
  const lastRuntimeTickReference = useRef(game.tick);
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

    void import("./game/FlyingCastleRuntime.js")
      .then(({ createFlyingCastleRuntime }) => {
        if (!disposed) {
          runtimeReference.current = createFlyingCastleRuntime(host, latestGame.current);
          lastRuntimeTickReference.current = latestGame.current.tick;
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
    } else if (shouldUpdateRuntime(lastRuntimeTickReference.current, game.tick)) {
      runtime.update(game);
    } else {
      return;
    }

    lastRuntimeTickReference.current = game.tick;
    lastRuntimeRunNumberReference.current = runNumber;
    lastRuntimeConnectionEpochReference.current = connectionEpoch;
  }, [connectionEpoch, game, runNumber]);

  return (
    <div
      className="battlefield-shell"
      data-testid="flying-castle-world"
      data-run-number={runNumber}
      data-castle-x={game.castle.x}
      data-castle-y={game.castle.y}
      data-castle-velocity-x={game.castle.velocityX}
      data-castle-hp={game.castle.hp}
      data-castle-max-hp={game.castle.maxHp}
      data-score={game.encounter.score}
      data-turret-angle={game.turretAngle}
      data-enemy-count={game.enemyShips.length}
      data-asteroid-count={game.asteroids.length}
      data-friendly-projectile-count={game.friendlyProjectiles.length}
      data-hostile-projectile-count={game.hostileProjectiles.length}
      data-missile-count={game.homingMissiles.length}
      data-latest-projectile-id={game.friendlyProjectiles.at(-1)?.entityId ?? ""}
      data-shield-active={game.shield.active}
      data-shield-angle={game.shield.angle}
      data-shield-energy={game.shield.energy}
    >
      <div ref={hostReference} className="battlefield-canvas" aria-hidden="true" />
      {failed && <p className="battlefield-fallback">Не удалось запустить Phaser-сцену.</p>}
      <span className="sr-only">
        Замок находится в точке {Math.round(game.castle.x)}, {Math.round(game.castle.y)}. Снарядов:{" "}
        {game.friendlyProjectiles.length + game.hostileProjectiles.length}. Врагов:{" "}
        {game.enemyShips.length}.
      </span>
    </div>
  );
}

export function shouldUpdateRuntime(previousTick: number, nextTick: number): boolean {
  return previousTick !== nextTick;
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
  runtime: FlyingCastleRuntime,
  snapshot: DisplayGameSnapshot
): void {
  runtime.prepareHydration();
  runtime.update(snapshot);
}
