import { roleLabel, formatLatency } from "@spaceship-defender/client-shared";
import type {
  ControllerRoomView,
  CrewRole,
  PublicPlayerView,
  UpgradeId
} from "@spaceship-defender/protocol";

import { MaintenanceNotice } from "../../components/MaintenanceNotice/index.js";
import { PreviewControls } from "../../components/PreviewControls/index.js";
import { RunResultPanel } from "../../components/RunResultPanel/index.js";
import { TeamUpgradePanel } from "../../components/TeamUpgradePanel/index.js";
import type { ControlState } from "../../model/control.js";
import type { ConnectionStatus } from "../../model/hooks/useControllerSession.js";
import type { ControllerPreview } from "../../model/hooks/useControllerPreview.js";
import { playCardPhaseModifier, shellPhaseModifier } from "../../model/shellClass.js";
import { LobbyScreen } from "../LobbyScreen/index.js";
import { RoleScreen } from "../RoleScreen/index.js";

interface RoomScreenProps {
  readonly view: ControllerRoomView | undefined;
  readonly currentPlayer: PublicPlayerView | undefined;
  readonly status: ConnectionStatus;
  readonly error: string;
  readonly roomCode: string;
  readonly connectionEpoch: number;
  readonly errorEpoch: number;
  /** Present only in the layout preview; its presence is what "fixture" means. */
  readonly preview: ControllerPreview | undefined;
  readonly onReady: () => void;
  readonly onSend: (sequence: number, control: ControlState, channel?: CrewRole) => void;
  readonly onVote: (upgradeId: UpgradeId, revision: number, actionId: string) => void;
  readonly onLeave: () => void;
}

/**
 * The panel once the server has granted a seat. Which stage it shows - the
 * lobby or the role controls - follows the phase in the room's state, because
 * the server owns the phase and the address must not become a second source.
 */
export function RoomScreen({
  view,
  currentPlayer,
  status,
  error,
  roomCode,
  connectionEpoch,
  errorEpoch,
  preview,
  onReady,
  onSend,
  onVote,
  onLeave
}: RoomScreenProps) {
  const inLobby = view?.phase === "lobby";
  const inCombat = view?.game?.encounter.phase === "combat";

  // Combat hangs the exit off the network cluster instead of the card, so it
  // stays out of both thumb zones.
  const leaveRoomButton =
    view !== undefined && currentPlayer !== undefined ? (
      <button
        type="button"
        className="secondary-button leave-room-button"
        disabled={status === "reconnecting"}
        onClick={() => {
          onLeave();
        }}
      >
        Выйти из комнаты
      </button>
    ) : null;

  return (
    <main
      className={`controller-shell${inLobby ? " controller-shell--lobby" : ""}${shellPhaseModifier(
        view?.game?.encounter.phase
      )}`}
    >
      {preview !== undefined && (
        <PreviewControls
          role={preview.role}
          phase={preview.phase}
          crewSize={preview.crewSize}
          onRoleChange={preview.onRoleChange}
          onPhaseChange={preview.onPhaseChange}
          onCrewSizeChange={preview.onCrewSizeChange}
        />
      )}
      <section
        className={`card play-card${inLobby ? " play-card--lobby" : ""}${playCardPhaseModifier(
          view?.game?.encounter.phase
        )}`}
      >
        <div className="status-row">
          <div className="room-identity">
            <p className="role-badge">
              {currentPlayer === undefined ? "Назначаем роль…" : roleLabel(currentPlayer.role)}
            </p>
            <span className="eyebrow">Комната {view?.roomId ?? roomCode}</span>
          </div>
          <span className="network-status">
            <span className={`connection connection--${status}`}>
              {status === "reconnecting" ? "Переподключение…" : "В сети"}
            </span>
            <span className="latency-indicator" aria-live="polite">
              До сервера{" "}
              {formatLatency(currentPlayer?.connected === true ? currentPlayer.latencyMs : null)}
            </span>
            {inCombat && leaveRoomButton}
          </span>
        </div>
        {error.length > 0 && <p className="error-message">{error}</p>}
        {view !== undefined && (
          <MaintenanceNotice
            active={view.maintenanceActive}
            secondsRemaining={view.maintenanceSecondsRemaining}
            inCombat={view.game?.encounter.phase === "combat"}
          />
        )}

        {view?.phase === "lobby" ? (
          <LobbyScreen
            view={view}
            currentPlayer={currentPlayer}
            reconnecting={status === "reconnecting"}
            onReady={onReady}
          />
        ) : view === undefined || currentPlayer === undefined ? (
          <p>Ожидаем подтверждение роли…</p>
        ) : (
          <>
            {view.game?.encounter.phase === "intermission" && (
              <TeamUpgradePanel
                role={currentPlayer.role}
                teamUpgrade={view.game.teamUpgrade}
                credits={view.game.credits}
                phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
                reconnecting={status === "reconnecting"}
                connectionEpoch={connectionEpoch}
                errorEpoch={errorEpoch}
                onVote={onVote}
              />
            )}
            {view.game?.encounter.phase === "result" && view.game.encounter.outcome !== null && (
              <RunResultPanel
                outcome={view.game.encounter.outcome}
                defeatReason={view.game.encounter.defeatReason}
                waveNumber={view.game.encounter.waveNumber}
                score={view.game.encounter.score}
                players={view.players}
                currentPlayer={currentPlayer}
                reconnecting={status === "reconnecting"}
                onRematch={onReady}
              />
            )}
            <RoleScreen
              role={currentPlayer.role}
              crewSize={view.crewSize}
              helm={view.game?.helm}
              shield={view.game?.shield}
              cannon={view.game?.cannon}
              machineGun={view.game?.machineGun}
              encounterPhase={view.game?.encounter.phase}
              connectionDisabled={status === "reconnecting"}
              generation={`${String(view.runNumber)}:${String(connectionEpoch)}`}
              hidden={view.game?.encounter.phase !== "combat"}
              onSend={onSend}
            />
          </>
        )}
        {!inCombat && leaveRoomButton}
      </section>
    </main>
  );
}
