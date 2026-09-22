import { createDefaultTuning, toSimulationConfig } from "@spaceship-defender/balance-core";
import type { DisplayRoomView, PublicShip } from "@spaceship-defender/protocol";
import { useMemo, useRef } from "react";

import type { DisplaySwitches } from "../../model/hooks/useDisplaySwitches.js";
import { useLocalRun } from "../../model/hooks/useLocalRun.js";
import { IDLE_INTENT, type LocalIntent } from "../../model/localRun/engine.js";
import type { PredictedInputFrame } from "../../model/shipPrediction.js";
import { RoomScreen } from "./index.js";

/**
 * The campaign, hosted by this page.
 *
 * Structurally the preview route's twin: it renders the real `RoomScreen`
 * without a session, and hands it a world it made itself. The difference is
 * that this world is not a fixture - it is a run being stepped, frame by frame,
 * in this tab.
 */

interface LocalRunRouteProps {
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  readonly switches: DisplaySwitches;
  readonly worldReady: boolean;
  readonly ships: readonly PublicShip[] | undefined;
  readonly shipArchetypeId: string | undefined;
  readonly playerName: string;
  readonly startWave: number;
  readonly onLeave: () => void;
}

/** What the room gives a wave before it is lost; the same number, locally. */
const WAVE_TTL_SECONDS = 180;

export function LocalRunRoute({
  diagnostics,
  visibleDemo,
  switches,
  worldReady,
  ships,
  shipArchetypeId,
  playerName,
  startWave,
  onLeave
}: LocalRunRouteProps) {
  /*
   * The balance this device carries. Built once: a run keeps the numbers it
   * started with, exactly as the room's does, so nothing can change under a
   * fight in progress.
   */
  const { config, tuning, hullId } = useMemo(() => {
    const built = createDefaultTuning();
    const hull = shipArchetypeId ?? built.defaultShipArchetypeId;
    return { config: toSimulationConfig(built, hull), tuning: built, hullId: hull };
  }, [shipArchetypeId]);

  /*
   * The cockpit's reader, as the screen fills it in. A ref because the screen
   * mounts the cockpit below us: the run asks for an intent every step, and
   * until the controls exist the answer is "hands off".
   */
  const readFrame = useRef<(() => PredictedInputFrame) | undefined>(undefined);

  const local = useLocalRun({
    config,
    tuning,
    shipArchetypeId: hullId,
    playerName,
    startWave,
    waveTtlSeconds: WAVE_TTL_SECONDS,
    readIntent: () => toLocalIntent(readFrame.current?.())
  });

  return (
    <RoomScreen
      view={local.view ?? PENDING_VIEW}
      diagnostics={diagnostics}
      visibleDemo={visibleDemo}
      switches={switches}
      worldReady={worldReady}
      ships={ships}
      session={undefined}
      cockpit={{
        playerId: "local-pilot",
        generation: 0,
        seat: local.view?.players[0],
        driver: local.driver,
        onControls: (controls) => {
          readFrame.current = controls;
        }
      }}
      preview={undefined}
      onCloseRoom={onLeave}
      onLeaveRoom={onLeave}
      onScan={() => undefined}
      onReady={() => {
        // The only thing readiness can mean here: play another one.
        local.restart();
      }}
      onVote={(upgradeId) => {
        local.vote(upgradeId);
      }}
    />
  );
}

/** The wire's flat frame as the simulation wants it: flags become absences. */
function toLocalIntent(frame: PredictedInputFrame | undefined): LocalIntent {
  if (frame === undefined) return IDLE_INTENT;
  return {
    vector: { x: frame.vectorX, y: frame.vectorY },
    turn: frame.hasHelm ? frame.turn : null,
    thrust: frame.hasHelm ? frame.thrust : null,
    mgFiring: frame.mgFiring,
    aim: { x: frame.aimX, y: frame.aimY },
    aimTurn: frame.hasAimTurn ? frame.aimTurn : null,
    firing: frame.firing
  };
}

/**
 * What the screen renders before the first frame is published.
 *
 * A lobby view rather than nothing: `RoomScreen` needs a view, and the run's
 * first publish is one animation frame away.
 */
const PENDING_VIEW: DisplayRoomView = {
  roomId: "LOCAL",
  phase: "lobby",
  runNumber: 0,
  crewSize: 1,
  shipArchetypeId: "guardian",
  maintenanceActive: false,
  maintenanceSecondsRemaining: 0,
  assetsPending: false,
  assetsWaitSecondsRemaining: 0,
  displayConnected: true,
  displayLatencyMs: null,
  players: [],
  game: null
};
