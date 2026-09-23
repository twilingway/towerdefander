import {
  createDefaultTuning,
  loadBalanceDocument,
  toPublicShipCatalogue,
  toSimulationConfig
} from "@spaceship-defender/balance-core";
import { loadBalanceSeed } from "@spaceship-defender/balance-core/seed";
import type { BalanceTuning, DisplayRoomView } from "@spaceship-defender/protocol";
import { useEffect, useMemo, useRef, useState } from "react";

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
  readonly shipArchetypeId: string | undefined;
  readonly playerName: string;
  readonly startWave: number;
  readonly onLeave: () => void;
}

/** What the room gives a wave before it is lost; the same number, locally. */
const WAVE_TTL_SECONDS = 180;

export function LocalRunRoute(props: LocalRunRouteProps) {
  /*
   * The numbers this device plays: the operator's promoted seed, which the
   * build carries, and the code's defaults only if that cannot be read. The run
   * is not started until they are in hand - a run keeps the balance it began
   * with, and beginning on the wrong one would mean a fight whose numbers
   * change under it.
   */
  const [tuning, setTuning] = useState<BalanceTuning | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadBalanceSeed()
      .then((raw) => {
        const loaded = loadBalanceDocument(raw);
        if (cancelled) return;
        if (!loaded.ok) {
          console.error(`Затравка баланса непригодна (${loaded.reason}): ${loaded.detail}`);
          setTuning(createDefaultTuning());
          return;
        }
        const preset =
          loaded.document.presets.find(({ id }) => id === loaded.document.activePresetId) ??
          loaded.document.presets[0];
        setTuning(preset?.tuning ?? createDefaultTuning());
      })
      .catch((error: unknown) => {
        /*
         * Loudly, because the quiet version cost an evening: the seed failed to
         * load, the run fell back to the code's defaults, and the game played
         * on with a different cannon, a different helm and no sprites at all -
         * looking for all the world like the preset simply was not being read.
         */
        console.error("Локальный прогон не смог прочитать затравку баланса", error);
        if (!cancelled) setTuning(createDefaultTuning());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (tuning === undefined) return null;
  return <LocalRunStage {...props} tuning={tuning} />;
}

function LocalRunStage({
  diagnostics,
  visibleDemo,
  switches,
  worldReady,
  shipArchetypeId,
  playerName,
  startWave,
  onLeave,
  tuning
}: LocalRunRouteProps & { readonly tuning: BalanceTuning }) {
  const { config, hullId, hulls } = useMemo(() => {
    const hull = shipArchetypeId ?? tuning.defaultShipArchetypeId;
    return {
      config: toSimulationConfig(tuning, hull),
      hullId: hull,
      /*
       * The hull catalogue off the same preset the run plays, because `/ships`
       * is a server route and this page asks the server nothing. It is not
       * decoration: the module tree the fight shows is read from it, so without
       * it the ship's own tree has no button at all.
       */
      hulls: toPublicShipCatalogue(tuning).ships
    };
  }, [shipArchetypeId, tuning]);

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
      ships={hulls}
      session={undefined}
      cockpit={{
        playerId: "local-pilot",
        generation: 0,
        local: true,
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
