import type { DisplayGameSnapshot } from "@town-defenders/protocol";
import { useEffect, useRef, useState } from "react";

import type { FlyingCastleRuntime } from "./game/FlyingCastleRuntime.js";

interface FlyingCastleCanvasProps {
  readonly game: DisplayGameSnapshot;
  readonly connectionEpoch: number;
}

export function FlyingCastleCanvas({ game, connectionEpoch }: FlyingCastleCanvasProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const runtimeReference = useRef<FlyingCastleRuntime | undefined>(undefined);
  const latestGame = useRef(game);
  const [failed, setFailed] = useState(false);
  latestGame.current = game;

  useEffect(() => {
    let disposed = false;
    const host = hostReference.current;
    if (host === null) return;

    void import("./game/FlyingCastleRuntime.js")
      .then(({ createFlyingCastleRuntime }) => {
        if (!disposed)
          runtimeReference.current = createFlyingCastleRuntime(host, latestGame.current);
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
    runtimeReference.current?.update(game);
  }, [game]);

  useEffect(() => {
    if (connectionEpoch > 0) runtimeReference.current?.prepareHydration();
  }, [connectionEpoch]);

  return (
    <div
      className="battlefield-shell"
      data-testid="flying-castle-world"
      data-castle-x={game.castle.x}
      data-castle-y={game.castle.y}
      data-castle-velocity-x={game.castle.velocityX}
      data-turret-angle={game.turretAngle}
      data-projectile-count={game.projectiles.length}
      data-latest-projectile-id={game.projectiles.at(-1)?.projectileId ?? ""}
      data-shield-active={game.shield.active}
      data-shield-energy={game.shield.energy}
    >
      <div ref={hostReference} className="battlefield-canvas" aria-hidden="true" />
      {failed && <p className="battlefield-fallback">Не удалось запустить Phaser-сцену.</p>}
      <span className="sr-only">
        Замок находится в точке {Math.round(game.castle.x)}, {Math.round(game.castle.y)}. Снарядов:{" "}
        {game.projectiles.length}.
      </span>
    </div>
  );
}
