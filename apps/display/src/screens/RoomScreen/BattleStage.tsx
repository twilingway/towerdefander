import type { DisplayRoomView, UpgradeId } from "@spaceship-defender/protocol";
import { Profiler, type ReactNode } from "react";

import { DiagnosticsHud } from "../../components/DiagnosticsHud/index.js";
import { RotateNotice } from "../../components/RotateNotice/index.js";
import { recordComponentCommit } from "../../model/componentCost.js";
import type { DisplaySwitches } from "../../model/hooks/useDisplaySwitches.js";
import { readDiagnostics, recordCommitWork, writeFrameStats } from "../../model/instruments.js";
import { readLiveGame } from "../../model/liveView.js";
import type { ModuleTree } from "../../model/moduleTree.js";
import { saveAimAssistToDevice } from "../../model/aimAssistPreference.js";
import type { SoloCockpitControls } from "../../model/hooks/useSoloCockpit.js";
import type { PredictionDriver } from "../../model/shipPrediction.js";
import { ARENA_SHIP_COUNT } from "@spaceship-defender/game-core";

import { ArenaResultOverlay } from "./ArenaResultOverlay.js";
import { PolledCombatRadar } from "./CombatRadar.js";
import { RunResultOverlay } from "./RunResultOverlay.js";
import { SpaceshipCanvas } from "./SpaceshipCanvas.js";
import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";
import {
  ArenaHudPanel,
  BattleHudPanel,
  BossPanel,
  CockpitPanel,
  CountdownPanel,
  CrewLatencyPanel,
  ModuleWindowPanel
} from "./panels.js";

/** What the fight needs to know about this page's own seat, if it holds one. */
export interface BattleCockpit {
  readonly seated: boolean;
  readonly seat: DisplayRoomView["players"][number] | undefined;
  readonly controls: SoloCockpitControls;
  readonly driver: PredictionDriver | undefined;
  readonly onVote: (upgradeId: UpgradeId) => void;
  readonly onReady: () => void;
}

interface BattleStageProps {
  /** The fight is only rendered when there is a game, so this one is not null. */
  readonly view: DisplayRoomView & { readonly game: NonNullable<DisplayRoomView["game"]> };
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  /** True when the world is a fixture rather than a room. */
  readonly preview: boolean;
  readonly portrait: boolean;
  readonly connectionEpoch: number;
  readonly switches: DisplaySwitches;
  readonly moduleTree: ModuleTree | undefined;
  readonly readRadarGame: () => NonNullable<DisplayRoomView["game"]> | undefined;
  readonly cockpit: BattleCockpit;
  readonly closingRoom: boolean;
  readonly onCloseRoom: () => void;
  /** Leaving without closing: what a downed arena pilot does instead. */
  readonly onLeaveRoom: () => void;
  /** One radar sweep, asked for from the match panel. */
  readonly onScan: () => void;
  readonly aimAssist: boolean;
  readonly onAimAssistChange: (aimAssist: boolean) => void;
}

/**
 * The fight itself: the canvas, the cockpit over it, and the readable interface
 * over both, in the reference prototype's order. Nothing above the canvas is
 * re-rendered or re-attributed while the arena is drawing.
 */
export function BattleStage({
  view,
  diagnostics,
  visibleDemo,
  preview,
  portrait,
  connectionEpoch,
  switches,
  moduleTree,
  readRadarGame,
  cockpit,
  closingRoom,
  onCloseRoom,
  onLeaveRoom,
  onScan,
  aimAssist,
  onAimAssistChange
}: BattleStageProps) {
  return (
    <MeasuredWhenAsked
      measuring={diagnostics}
      onCommit={(actualDuration) => {
        recordCommitWork(actualDuration, performance.now());
      }}
    >
      <section id="game-canvas" className="game-stage" aria-label="Космическое поле боя">
        {/*
          The order is the reference prototype's: the world first, the layer
          a thumb touches next, and the readable interface after both. What
          it buys is that nothing above the canvas is re-rendered or
          re-attributed while the arena is drawing.
        */}
        <MeteredPanel id="сцена" measuring={diagnostics}>
          {portrait ? (
            <RotateNotice />
          ) : (
            <SpaceshipCanvas
              game={view.game}
              /*
               * Only a seat gets a predicted hull. The driver steps this page's
               * own input, and its world is the render-time snapshot - which a
               * combat page deliberately stops re-rendering. Handed to a
               * spectator display, that draws the hull at the spawn point for
               * the whole run, parks the camera on it, and leaves every other
               * entity to be drawn at its true place around a ship that is not
               * there. Unseated, the scene interpolates the snapshot track it
               * pulls from the wire instead.
               */
              prediction={cockpit.seated ? cockpit.driver : undefined}
              // The preview has no room to read from: it renders a fixture
              // straight through the prop, and a reader that answers nothing
              // would leave its scene without a world at all.
              readGame={!preview ? readLiveGame : undefined}
              runNumber={view.runNumber}
              connectionEpoch={connectionEpoch}
              visibleDemo={visibleDemo}
              vectorsEnabled={switches.vectorsEnabled}
              onFrameStats={(stats) => {
                writeFrameStats(stats);
              }}
            />
          )}
        </MeteredPanel>
        <MeteredPanel id="кокпит" measuring={diagnostics}>
          {cockpit.seated && !portrait && switches.interfaceEnabled && (
            <CockpitPanel
              controls={cockpit.controls}
              aimAssist={aimAssist}
              onAimAssistChange={(next) => {
                onAimAssistChange(next);
                saveAimAssistToDevice(next);
              }}
            />
          )}
        </MeteredPanel>
        <MeteredPanel id="шапка" measuring={diagnostics}>
          {/* A match reads itself: how many are left, how many I took, where I
            stand. The campaign's wave, score and credits mean nothing here. */}
          {switches.interfaceEnabled &&
            (view.game.arenaShips.length > 0 ? (
              <ArenaHudPanel onScan={onScan} />
            ) : (
              <BattleHudPanel />
            ))}
        </MeteredPanel>

        <MeteredPanel id="часы" measuring={diagnostics}>
          <CountdownPanel />
        </MeteredPanel>
        <MeteredPanel id="босс" measuring={diagnostics}>
          <BossPanel />
        </MeteredPanel>
        <MeteredPanel id="приборы" measuring={diagnostics}>
          {diagnostics && (
            <DiagnosticsHud
              read={readDiagnostics}
              predictionEnabled={switches.predictionEnabled}
              onTogglePrediction={switches.togglePrediction}
              vectorsEnabled={switches.vectorsEnabled}
              onToggleVectors={switches.toggleVectors}
              interfaceEnabled={switches.interfaceEnabled}
              onToggleInterface={switches.toggleInterface}
              opaquePanels={switches.opaquePanels}
              onToggleOpaquePanels={switches.toggleOpaquePanels}
            />
          )}
        </MeteredPanel>
        <MeteredPanel id="радар" measuring={diagnostics}>
          {switches.interfaceEnabled && <PolledCombatRadar read={readRadarGame} />}
        </MeteredPanel>
        {view.game.encounter.phase === "intermission" && (
          <TeamUpgradeOverlay
            teamUpgrade={view.game.teamUpgrade}
            credits={view.game.credits}
            score={view.game.encounter.score}
            waveNumber={view.game.encounter.waveNumber}
            phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
            purchasedModules={view.game.purchasedModules}
            {...(cockpit.seat === undefined
              ? {}
              : { cockpit: { role: cockpit.seat.role, onVote: cockpit.onVote } })}
          />
        )}
        {/*
         * A match reports itself, a run reports itself, and they are not the
         * same report: the arena has no wave to name, no score to total and no
         * crew to agree on a rematch. The field is what tells them apart -
         * sixteen published hulls is a match and nothing else has them.
         */}
        {view.game.encounter.phase === "result" &&
          view.game.encounter.outcome !== null &&
          view.game.arenaShips.length > 0 && (
            <ArenaResultOverlay
              outcome={view.game.encounter.outcome}
              survivors={view.game.arenaShips.filter((ship) => !ship.isSelf && ship.alive).length}
              fieldSize={ARENA_SHIP_COUNT}
              leaving={closingRoom}
              onLeave={onLeaveRoom}
            />
          )}
        {view.game.encounter.phase === "result" &&
          view.game.encounter.outcome !== null &&
          view.game.arenaShips.length === 0 && (
            <RunResultOverlay
              outcome={view.game.encounter.outcome}
              defeatReason={view.game.encounter.defeatReason}
              waveNumber={view.game.encounter.waveNumber}
              score={view.game.encounter.score}
              readyCount={view.players.filter(({ ready }) => ready).length}
              crewSize={view.crewSize}
              closing={closingRoom}
              onClose={onCloseRoom}
              {...(!cockpit.seated
                ? {}
                : {
                    cockpit: {
                      ready: cockpit.seat?.ready === true,
                      onReady: cockpit.onReady
                    }
                  })}
            />
          )}
        {/* The run's own hull, straight from the catalogue; the fixture is
          the preview's stand-in when no server answered. */}
        <MeteredPanel id="модули" measuring={diagnostics}>
          {moduleTree !== undefined &&
            switches.interfaceEnabled &&
            view.game.arenaShips.length === 0 && (
              <ModuleWindowPanel
                tiers={moduleTree.tiers}
                endlessTier={moduleTree.endlessTier}
                initiallyShown={preview}
              />
            )}
        </MeteredPanel>
        {/*
        Stacked directly under the instrument panel and answering the same
        question, so with the panel open it is the third ping on one edge of
        the screen. The panel wins; the crew rows come back the moment the
        flag goes away.
      */}
        <MeteredPanel id="экипаж" measuring={diagnostics}>
          {/* A crew roster over a match is four dashes and a line about
            purchases: there is no crew, and nothing to buy. */}
          {!diagnostics && view.game.arenaShips.length === 0 && <CrewLatencyPanel />}
        </MeteredPanel>
      </section>
    </MeasuredWhenAsked>
  );
}

/**
 * One panel, timed under its own name.
 *
 * Same bargain as the tree above: nothing is mounted unless the instruments
 * were asked for, because a profiler around eight panels is eight timers on
 * every commit of a page that commits on every patch.
 */
function MeteredPanel({
  id,
  measuring,
  children
}: {
  readonly id: string;
  readonly measuring: boolean;
  readonly children: ReactNode;
}) {
  if (!measuring) return children;
  return (
    <Profiler
      id={id}
      onRender={(profilerId, _phase, actualDuration) => {
        recordComponentCommit(profilerId, actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}

function MeasuredWhenAsked({
  measuring,
  onCommit,
  children
}: {
  readonly measuring: boolean;
  readonly onCommit: (actualDurationMs: number) => void;
  readonly children: ReactNode;
}) {
  if (!measuring) return children;
  return (
    <Profiler
      id="battle"
      onRender={(_id, _phase, actualDuration) => {
        onCommit(actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}
