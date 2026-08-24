import { Client, type Room } from "@colyseus/sdk";
import {
  CREW_ROLES,
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  roomClosingSchema,
  serverLatencyProbeSchema,
  serverMessage,
  type CrewRole,
  type DisplayRoomView,
  type EncounterPhase
} from "@spaceship-defender/protocol";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CombatRadar } from "./CombatRadar.js";
import { getCurrentWaveUpgrade } from "./combatHudViewModel.js";
import { MachineGunHeat } from "./MachineGunHeat.js";
import { SpaceshipCanvas } from "./SpaceshipCanvas.js";
import { TeamUpgradeOverlay } from "./TeamUpgradeOverlay.js";
import { VisibleDemoOverlay } from "./VisibleDemoOverlay.js";
import { WaveCountdown } from "./WaveCountdown.js";
import { RunResultOverlay } from "./RunResultOverlay.js";
import {
  closeDisplayRoom,
  confirmDisplayRoomClose,
  roomClosingMessage
} from "./displayRoomLifecycle.js";
import {
  createPreviewRoomView,
  isPreviewMode,
  PREVIEW_PHASES,
  type PreviewPhase
} from "./previewMode.js";
import { createControllerJoinUrl, toDisplayRoomView, type NetworkRoomState } from "./roomView.js";
import { roleLabel } from "./roleLabel.js";
import { isVisibleDemoMode } from "./visibleDemo.js";

type DisplayRoom = Room<unknown, NetworkRoomState>;
type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

const gameServerUrl = readStringEnvironment(
  import.meta.env.VITE_GAME_SERVER_URL,
  createDefaultGameServerUrl()
);
const controllerUrl = readStringEnvironment(
  import.meta.env.VITE_CONTROLLER_URL,
  createDefaultControllerUrl()
);

export function DisplayApp() {
  const visibleDemo = isVisibleDemoMode(
    typeof window === "undefined" ? "" : window.location.search,
    import.meta.env.DEV,
    import.meta.env.VITE_VISIBLE_DEMO
  );
  const preview = isPreviewMode(
    typeof window === "undefined" ? "" : window.location.search,
    import.meta.env.DEV
  );
  const roomReference = useRef<DisplayRoom | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [networkView, setNetworkView] = useState<DisplayRoomView>();
  const [error, setError] = useState("");
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [closingRoom, setClosingRoom] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("combat");
  // Layout preview feeds the same view the network fills, so the HUD, overlays
  // and the Phaser frame all render through the production path.
  const previewView = useMemo(
    () => (preview ? createPreviewRoomView(previewPhase) : undefined),
    [preview, previewPhase]
  );
  const view = previewView ?? networkView;
  const activeStatus: ConnectionStatus = previewView === undefined ? status : "connected";
  const joinUrl = useMemo(
    () => (view === undefined ? "" : createControllerJoinUrl(controllerUrl, view.roomId)),
    [view]
  );

  useEffect(
    () => () => {
      const room = roomReference.current;
      roomReference.current = undefined;
      if (room !== undefined) {
        room.reconnection.enabled = false;
        void room.leave(false);
      }
    },
    []
  );

  async function createRoom(): Promise<void> {
    setStatus("connecting");
    setError("");
    setClosingRoom(false);
    try {
      const room = await new Client(gameServerUrl).create<NetworkRoomState>(ROOM_TYPE, {
        role: "display",
        protocolVersion: PROTOCOL_VERSION
      });
      roomReference.current = room;
      room.onStateChange((state) => {
        if (roomReference.current === room) applyRoomState(state);
      });
      applyRoomState(room.state);
      room.onMessage(serverMessage.latencyProbe, (payload: unknown) => {
        const result = serverLatencyProbeSchema.safeParse(payload);
        if (!result.success) return;
        room.send(clientMessage.latencyPong, {
          protocolVersion: PROTOCOL_VERSION,
          roomId: room.roomId,
          probeId: result.data.probeId
        });
      });
      room.onMessage(serverMessage.roomClosing, (payload: unknown) => {
        const result = roomClosingSchema.safeParse(payload);
        if (!result.success || roomReference.current !== room) return;
        room.reconnection.enabled = false;
        roomReference.current = undefined;
        resetToCreate(roomClosingMessage(result.data.reason));
      });
      room.onDrop(() => {
        if (roomReference.current !== room) return;
        setStatus("reconnecting");
        setError("Связь прервана. Восстанавливаем общий экран…");
        setConnectionEpoch((value) => value + 1);
      });
      room.onReconnect(() => {
        if (roomReference.current !== room) return;
        setStatus("connected");
        setError("");
      });
      room.onError((_code, message) => {
        if (roomReference.current !== room) return;
        setStatus("error");
        setError(message ?? "Сервер сообщил об ошибке.");
      });
      room.onLeave(() => {
        if (roomReference.current !== room) return;
        roomReference.current = undefined;
        resetToCreate("Комната закрыта. Создайте новую сессию.");
      });
    } catch (reason) {
      setStatus("error");
      setError(reason instanceof Error ? reason.message : "Не удалось создать комнату.");
    }
  }

  function applyRoomState(state: NetworkRoomState): void {
    const next = toDisplayRoomView(state);
    if (next !== undefined) {
      setNetworkView(next);
      setStatus("connected");
    }
  }

  function resetToCreate(message: string): void {
    setNetworkView(undefined);
    setStatus("idle");
    setError(message);
    setConnectionEpoch(0);
    setClosingRoom(false);
  }

  async function handleCloseRoom(): Promise<void> {
    const room = roomReference.current;
    if (room === undefined || !confirmDisplayRoomClose((message) => window.confirm(message))) {
      return;
    }

    setClosingRoom(true);
    roomReference.current = undefined;
    try {
      await closeDisplayRoom(room);
      resetToCreate("Комната закрыта общим экраном.");
    } catch {
      resetToCreate("Не удалось подтвердить закрытие комнаты. Создайте новую сессию.");
    }
  }

  if ((activeStatus !== "connected" && activeStatus !== "reconnecting") || view === undefined) {
    return (
      <main className="display-shell display-shell--centered">
        <section className="hero-card">
          <p className="eyebrow">Общий экран</p>
          <h1>SpaceShip Defender</h1>
          <p>Три игрока управляют одним космическим кораблём: движение, орудия и щит.</p>
          {error.length > 0 && <p className="error-message">{error}</p>}
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={status === "connecting"}
          >
            {status === "connecting" ? "Создаём комнату…" : "Создать комнату"}
          </button>
        </section>
        {visibleDemo ? (
          <VisibleDemoOverlay
            connectionStatus={status}
            phase="lobby"
            waveNumber={undefined}
            snapshotTick={undefined}
          />
        ) : null}
      </main>
    );
  }

  const waveUpgrade =
    view.game === null
      ? null
      : getCurrentWaveUpgrade(view.game.teamUpgrade.selection, view.game.encounter.waveNumber);

  return (
    <main className={`display-shell ${view.game === null ? "" : "display-shell--battle"}`}>
      {previewView !== undefined && (
        <PreviewControls phase={previewPhase} onPhaseChange={setPreviewPhase} />
      )}
      <header className="room-header">
        <div>
          <p className="eyebrow">Комната</p>
          <strong className="room-code">{view.roomId}</strong>
        </div>
        <div className="room-network">
          <div className={`phase-badge phase-badge--${view.phase}`}>
            {view.phase === "active" ? "Корабль в бою" : "Собираем экипаж"}
          </div>
          <span className="latency-indicator" aria-live="polite">
            Экран → сервер {formatLatency(view.displayLatencyMs)}
          </span>
          <button
            type="button"
            className="room-close-button"
            onClick={() => void handleCloseRoom()}
            disabled={closingRoom}
          >
            {closingRoom ? "Закрываем комнату…" : "Закрыть комнату"}
          </button>
        </div>
      </header>
      {error.length > 0 && <p className="error-message">{error}</p>}

      <section className={`lobby-layout ${view.game === null ? "" : "lobby-layout--battle"}`}>
        <div className="join-card">
          <QRCodeSVG value={joinUrl} size={180} bgColor="#f6f4e8" fgColor="#10201f" level="M" />
          <div>
            <h2>Подключите три контроллера</h2>
            <p>Первый игрок — pilot, второй — gunner, третий — shield.</p>
            <a href={joinUrl}>{joinUrl}</a>
          </div>
        </div>
        <div className="players-card">
          <h2>Экипаж · {view.players.length}/3</h2>
          <div className="player-list">
            {CREW_ROLES.map((role) => {
              const player = view.players.find((candidate) => candidate.role === role);
              return (
                <div
                  className={`player-slot ${player === undefined ? "player-slot--empty" : ""}`}
                  key={role}
                >
                  <span>
                    <strong>{roleLabel(role)}</strong>
                    <small>{player?.playerName ?? "ожидаем игрока…"}</small>
                    <small>
                      Пинг {formatLatency(player?.connected === true ? player.latencyMs : null)}
                    </small>
                  </span>
                  <span className={player?.ready === true ? "ready" : "waiting"}>
                    {player === undefined
                      ? "свободно"
                      : `${player.connected ? "в сети" : "переподключается"} · ${player.ready ? "готов" : "не готов"}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {view.game === null ? (
        <section id="game-canvas" className="game-stage game-stage--waiting">
          <span>Полёт начнётся, когда pilot, gunner и shield нажмут «Готов»</span>
        </section>
      ) : (
        <section id="game-canvas" className="game-stage" aria-label="Космическое поле боя">
          <header className="battle-header spaceship-hud">
            <div>
              <span>Волна</span>
              <strong>{view.game.encounter.waveNumber}</strong>
              <small>{encounterLabel(view.game.encounter.phase)}</small>
            </div>
            <div>
              <span>Корпус</span>
              <strong>
                {Math.ceil(view.game.spaceship.hp)} / {Math.ceil(view.game.spaceship.maxHp)}
              </strong>
              <div className="hud-energy hud-energy--hull" aria-label="Прочность корпуса">
                <i
                  style={{
                    width: `${String((view.game.spaceship.hp / view.game.spaceship.maxHp) * 100)}%`
                  }}
                />
              </div>
            </div>
            <div>
              <span>Щит</span>
              <strong>{view.game.shield.active ? "АКТИВЕН" : "выключен"}</strong>
              <div className="hud-energy" aria-label="Энергия щита">
                <i
                  style={{
                    width: `${String((view.game.shield.energy / view.game.shield.capacity) * 100)}%`
                  }}
                />
              </div>
              <small>
                {Math.round(view.game.shield.energy)} / {Math.round(view.game.shield.capacity)}
              </small>
            </div>
            <div>
              <span>Счёт</span>
              <strong>{view.game.encounter.score}</strong>
              <small>
                Враги {view.game.enemyShips.length} · Ракеты {view.game.homingMissiles.length}
              </small>
            </div>
            <div>
              <span>Кредиты</span>
              <strong>{view.game.credits}</strong>
              <small>
                {waveUpgrade === null
                  ? "в этой волне улучшений нет"
                  : `улучшение волны: ${roleLabel(waveUpgrade.role)}`}
              </small>
            </div>
            <MachineGunHeat machineGun={view.game.machineGun} />
          </header>
          <SpaceshipCanvas
            game={view.game}
            runNumber={view.runNumber}
            connectionEpoch={connectionEpoch}
            visibleDemo={visibleDemo}
          />
          {view.game.encounter.phase === "combat" && (
            <WaveCountdown
              className="display-wave-countdown"
              secondsRemaining={view.game.encounter.waveSecondsRemaining}
            />
          )}
          <CombatRadar game={view.game} />
          {view.game.encounter.phase === "intermission" && (
            <TeamUpgradeOverlay
              teamUpgrade={view.game.teamUpgrade}
              credits={view.game.credits}
              score={view.game.encounter.score}
              waveNumber={view.game.encounter.waveNumber}
              phaseTicksRemaining={view.game.encounter.phaseTicksRemaining}
            />
          )}
          {view.game.encounter.phase === "result" && view.game.encounter.outcome !== null && (
            <RunResultOverlay
              outcome={view.game.encounter.outcome}
              defeatReason={view.game.encounter.defeatReason}
              waveNumber={view.game.encounter.waveNumber}
              score={view.game.encounter.score}
              readyCount={view.players.filter(({ ready }) => ready).length}
              closing={closingRoom}
              onClose={() => void handleCloseRoom()}
            />
          )}
          <aside className="crew-latency-overlay" aria-label="Пинг участников до сервера">
            <strong>Пинг до сервера</strong>
            <span className="latency-row">
              Экран → сервер {formatLatency(view.displayLatencyMs)}
            </span>
            {CREW_ROLES.map((role) => {
              const player = view.players.find((candidate) => candidate.role === role);
              return (
                <span className="latency-row" key={role}>
                  {latencyRoleLabel(role)}{" "}
                  {formatLatency(player?.connected === true ? player.latencyMs : null)}
                </span>
              );
            })}
            <span>
              Модификаторы: P ×{view.game.roleModifiers.pilot.speedMultiplier.toFixed(2)} · G ×
              {view.game.roleModifiers.gunner.damageMultiplier.toFixed(2)} · S +
              {Math.round(view.game.roleModifiers.shield.capacityBonus)}
            </span>
          </aside>
        </section>
      )}
      {visibleDemo ? (
        <VisibleDemoOverlay
          connectionStatus={status}
          phase={view.game?.encounter.phase ?? view.phase}
          waveNumber={view.game?.encounter.waveNumber}
          snapshotTick={view.game?.tick}
        />
      ) : null}
    </main>
  );
}

export function PreviewControls({
  phase,
  onPhaseChange
}: {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`preview-controls${open ? "" : " preview-controls--collapsed"}`}
      data-testid="preview-controls"
    >
      <button
        type="button"
        className="preview-controls__toggle"
        aria-expanded={open}
        aria-label={open ? "Свернуть панель превью" : "Развернуть панель превью"}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? "×" : "⚙"}
      </button>
      {open && (
        <>
          <span className="eyebrow">Превью верстки</span>
          {PREVIEW_PHASES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === phase}
              onClick={() => {
                onPhaseChange(candidate);
              }}
            >
              {previewPhaseLabel(candidate)}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function previewPhaseLabel(phase: PreviewPhase): string {
  if (phase === "lobby") return "Лобби";
  if (phase === "combat") return "Бой";
  return phase === "intermission" ? "Передышка" : "Итог";
}

function formatLatency(latencyMs: number | null | undefined): string {
  return latencyMs === null || latencyMs === undefined ? "—" : `${String(latencyMs)} мс`;
}

function encounterLabel(phase: EncounterPhase): string {
  return phase === "combat" ? "бой" : phase === "intermission" ? "передышка" : "результат";
}

function latencyRoleLabel(role: CrewRole): string {
  return role === "shield" ? "Щит" : roleLabel(role);
}

function readStringEnvironment(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function createDefaultGameServerUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:2567";
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:2567`;
}

function createDefaultControllerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:5174";
  return `${window.location.protocol}//${window.location.hostname}:5174`;
}
