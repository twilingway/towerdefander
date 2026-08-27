import { VisibleDemoOverlay } from "../../VisibleDemoOverlay.js";

interface CreateRoomScreenProps {
  readonly status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  readonly error: string;
  readonly visibleDemo: boolean;
  readonly onCreate: () => void;
}

/** Shown until a room exists: the pitch and the one button that opens one. */
export function CreateRoomScreen({ status, error, visibleDemo, onCreate }: CreateRoomScreenProps) {
  return (
    <main className="display-shell display-shell--centered">
      <section className="hero-card">
        <p className="eyebrow">Общий экран</p>
        <h1>SpaceShip Defender</h1>
        <p>Три игрока управляют одним космическим кораблём: движение, орудия и щит.</p>
        {error.length > 0 && <p className="error-message">{error}</p>}
        <button type="button" onClick={onCreate} disabled={status === "connecting"}>
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
