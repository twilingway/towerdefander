interface JoinScreenProps {
  readonly roomCode: string;
  readonly playerName: string;
  readonly error: string;
  readonly joining: boolean;
  readonly onRoomCodeChange: (roomCode: string) => void;
  readonly onPlayerNameChange: (playerName: string) => void;
  readonly onSubmit: () => void;
}

/** First screen: room code and name, before any socket exists. */
export function JoinScreen({
  roomCode,
  playerName,
  error,
  joining,
  onRoomCodeChange,
  onPlayerNameChange,
  onSubmit
}: JoinScreenProps) {
  return (
    <main className="controller-shell">
      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <p className="eyebrow">Контроллер экипажа</p>
        <span className="latency-indicator">До сервера —</span>
        <h1>SpaceShip Defender</h1>
        <label>
          Код комнаты
          <input
            name="roomCode"
            value={roomCode}
            onChange={(event) => {
              onRoomCodeChange(event.target.value);
            }}
          />
        </label>
        <label>
          Имя
          <input
            name="playerName"
            maxLength={24}
            value={playerName}
            onChange={(event) => {
              onPlayerNameChange(event.target.value);
            }}
          />
        </label>
        {error.length > 0 && <p className="error-message">{error}</p>}
        <button type="submit" disabled={joining}>
          {joining ? "Подключаемся…" : "Подключиться"}
        </button>
      </form>
    </main>
  );
}
