import type { PublicGameSnapshot, PublicPlayerView } from "@town-defenders/protocol";
import { useEffect, useRef, useState } from "react";

import type { BattlefieldRuntime, BattlefieldViewSnapshot } from "./game/BattlefieldRuntime.js";

interface BattlefieldCanvasProps {
  readonly game: PublicGameSnapshot;
  readonly players: readonly PublicPlayerView[];
  readonly connectionEpoch: number;
}

export function BattlefieldCanvas({ game, players, connectionEpoch }: BattlefieldCanvasProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const runtimeReference = useRef<BattlefieldRuntime | undefined>(undefined);
  const latestSnapshot = useRef<BattlefieldViewSnapshot>({ game, players });
  const [failed, setFailed] = useState(false);
  latestSnapshot.current = { game, players };

  useEffect(() => {
    let disposed = false;
    const host = hostReference.current;
    if (host === null) {
      return;
    }

    void import("./game/BattlefieldRuntime.js")
      .then(({ createBattlefieldRuntime }) => {
        if (disposed) {
          return;
        }
        runtimeReference.current = createBattlefieldRuntime(host, latestSnapshot.current);
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
        }
      });

    return () => {
      disposed = true;
      runtimeReference.current?.destroy();
      runtimeReference.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (connectionEpoch > 0) {
      runtimeReference.current?.prepareHydration();
    }
  }, [connectionEpoch]);

  useEffect(() => {
    runtimeReference.current?.update({ game, players });
  }, [game, players]);

  return (
    <div
      className="battlefield-shell"
      data-airstrike-sequence={game.lastAirstrikeEffect?.sequence ?? 0}
      data-enemy-count={game.enemies.length}
    >
      <div
        ref={hostReference}
        className="battlefield-canvas"
        data-testid="battlefield-canvas"
        aria-hidden="true"
      />
      {failed && (
        <p className="battlefield-fallback">
          Не удалось запустить графическую сцену. Игровое состояние остаётся доступно в HUD.
        </p>
      )}
      <span className="sr-only">
        Волна {game.waveNumber} из {game.totalWaves}. Врагов на поле: {game.enemies.length}.
      </span>
    </div>
  );
}
