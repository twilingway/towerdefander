/** What a barrel is on this panel, and nothing more: it is a gauge, not a gun. */
interface GunHeat {
  readonly heat: number;
  readonly capacity: number;
  readonly overheated: boolean;
}

interface ArenaHudProps {
  /** Hulls still flying, the player's own included. */
  readonly alive: number;
  readonly fieldSize: number;
  /** Wrecks with this pilot's name on them. */
  readonly kills: number;
  /**
   * Where this pilot stands: the place they would take by falling now, which is
   * the number of ships still up. It stops moving when theirs is gone, so what
   * is left on screen is the place they actually took.
   */
  readonly place: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
  readonly shieldCapacity: number;
  readonly shieldActive: boolean;
  readonly cannon: GunHeat;
  readonly machineGun: GunHeat;
  /** Seconds until the sweep may be asked for again; zero means it is live. */
  readonly scanReadySeconds: number;
  /** Seconds the last sweep still has on the dial; zero means the dial is blind. */
  readonly scanRevealSecondsRemaining: number;
  readonly onScan: () => void;
}

/**
 * The arena's own head-up display.
 *
 * The campaign's says wave, score and credits, and a match has none of the
 * three: no waves to number, no economy to spend and nothing to buy between
 * fights. What a pilot asks here is how many are left, how many they took and
 * where they stand - and then, on the right, the two things that decide the
 * next ten seconds: what the hull has left and whether the gun can fire.
 *
 * Bars rather than numbers on the right half. A number has to be read; a bar is
 * seen, and this is a panel nobody is looking at directly while it matters.
 */
export function ArenaHud({
  alive,
  fieldSize,
  kills,
  place,
  hp,
  maxHp,
  shield,
  shieldCapacity,
  shieldActive,
  cannon,
  machineGun,
  scanReadySeconds,
  scanRevealSecondsRemaining,
  onScan
}: ArenaHudProps) {
  return (
    <header className="battle-header arena-hud">
      <div className="arena-hud__counts">
        <div>
          <span>Живых</span>
          <strong>
            {alive}
            <small>/{fieldSize}</small>
          </strong>
        </div>
        <div>
          <span>Сбитые</span>
          <strong data-testid="arena-hud-kills">{kills}</strong>
        </div>
        <div>
          <span>Место</span>
          <strong data-testid="arena-hud-place">{place}</strong>
        </div>
      </div>

      <div className="arena-hud__ship">
        <Gauge
          label="Корпус"
          value={hp}
          capacity={maxHp}
          tone={hp / Math.max(1, maxHp) > 0.35 ? "hull" : "danger"}
        />
        <Gauge
          label="Щит"
          value={shield}
          capacity={shieldCapacity}
          tone={shieldActive ? "shield" : "shield-down"}
        />
        {/* Heat fills as the barrel warms, so it is the one gauge that is bad
          when it is full - and the only one that says what will happen if you
          keep the trigger down. */}
        <Gauge
          label="Пушка"
          value={cannon.capacity - cannon.heat}
          capacity={cannon.capacity}
          tone={cannon.overheated ? "danger" : "heat"}
        />
        <Gauge
          label="Пулемёт"
          value={machineGun.capacity - machineGun.heat}
          capacity={machineGun.capacity}
          tone={machineGun.overheated ? "danger" : "heat"}
        />
        {/*
         * The sweep, under the gauges it is read with.
         *
         * A button that says what it costs: while it is cooling it shows the
         * wait rather than going dead, because the number is the decision - a
         * pilot times the next sweep against the zone closing, not against a
         * greyed-out control.
         */}
        <button
          type="button"
          className={`arena-scan${scanReadySeconds > 0 ? " is-cooling" : ""}`}
          data-testid="arena-scan"
          onClick={onScan}
          disabled={scanReadySeconds > 0}
        >
          <span className="arena-scan__label">Скан</span>
          <span className="arena-scan__clock">
            {scanReadySeconds > 0
              ? `${String(scanReadySeconds)} с`
              : scanRevealSecondsRemaining > 0
                ? `метки ${String(scanRevealSecondsRemaining)} с`
                : "готов"}
          </span>
        </button>
      </div>
    </header>
  );
}

/** Ten cells rather than a smooth bar: a segment is countable at a glance. */
const SEGMENTS = 10;

function Gauge({
  label,
  value,
  capacity,
  tone
}: {
  readonly label: string;
  readonly value: number;
  readonly capacity: number;
  readonly tone: "hull" | "shield" | "shield-down" | "heat" | "danger";
}) {
  const share = capacity <= 0 ? 0 : Math.max(0, Math.min(1, value / capacity));
  const lit = Math.round(share * SEGMENTS);
  return (
    <div className={`arena-gauge arena-gauge--${tone}`}>
      <span className="arena-gauge__label">{label}</span>
      <span className="arena-gauge__cells" role="presentation">
        {Array.from({ length: SEGMENTS }, (_unused, index) => (
          <i key={index} className={index < lit ? "is-lit" : ""} />
        ))}
      </span>
    </div>
  );
}
