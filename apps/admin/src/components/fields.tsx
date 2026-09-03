import {
  FRIENDLY_WEAPON_KINDS,
  SPAWN_SECTORS,
  type FriendlyWeaponKind,
  type SpawnSector
} from "@spaceship-defender/protocol";

import { TICK_SECONDS, secondsToTicks, ticksToSeconds } from "../waveSummary.js";

const SECTOR_HINTS: Record<SpawnSector, string> = {
  N: "сверху",
  NE: "сверху справа",
  E: "справа",
  SE: "снизу справа",
  S: "снизу",
  SW: "снизу слева",
  W: "слева",
  NW: "сверху слева"
};

interface SectorPickerProps {
  readonly value: readonly SpawnSector[];
  readonly onChange: (sectors: readonly SpawnSector[]) => void;
}

/** Checkbox chips: nothing ticked means the whole circumference. */
export function SectorPicker({ value, onChange }: SectorPickerProps) {
  return (
    <div className="sectors" role="group" aria-label="Секторы появления">
      {SPAWN_SECTORS.map((sector) => {
        const active = value.includes(sector);
        return (
          <button
            key={sector}
            type="button"
            title={SECTOR_HINTS[sector]}
            className={`sectors__chip${active ? " sectors__chip--on" : ""}`}
            aria-pressed={active}
            onClick={() => {
              onChange(active ? value.filter((item) => item !== sector) : [...value, sector]);
            }}
          >
            {sector}
          </button>
        );
      })}
    </div>
  );
}

interface WeaponKindFieldProps {
  readonly caption: string;
  readonly value: FriendlyWeaponKind;
  readonly onChange: (value: FriendlyWeaponKind) => void;
}

/** Как ствол доставляет урон. Стоит в разделе самого ствола, потому что от него
 * зависит, какие из остальных чисел этого раздела вообще читаются. */
export function WeaponKindField({ caption, value, onChange }: WeaponKindFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <select
        className="field__input"
        value={value}
        onChange={(event) => {
          onChange(event.target.value as FriendlyWeaponKind);
        }}
      >
        {FRIENDLY_WEAPON_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {FRIENDLY_WEAPON_KIND_LABELS[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

export const FRIENDLY_WEAPON_KIND_LABELS: Record<FriendlyWeaponKind, string> = {
  kinetic: "кинетика — снаряд летит, нужно упреждение",
  laser: "лазер — не мажет, но не достаёт далеко",
  missile: "ракета — догоняет сама, но медленная"
};

/**
 * The preset counts in fixed steps and the console edits seconds, so every
 * seconds field also says what it is in ticks. Otherwise the value on screen
 * and the value in the file are two different numbers with the same name.
 */
function tickHint(ticks: number): string {
  return `· ${String(Math.round(ticks))} ${tickWord(Math.round(ticks))}`;
}

function tickWord(ticks: number): string {
  const tail = ticks % 100;
  if (tail >= 11 && tail <= 14) return "тиков";
  switch (ticks % 10) {
    case 1:
      return "тик";
    case 2:
    case 3:
    case 4:
      return "тика";
    default:
      return "тиков";
  }
}

interface NumberFieldProps {
  readonly caption: string;
  readonly value: number;
  readonly step?: number;
  readonly min?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

export function NumberField({
  caption,
  value,
  step = 1,
  min = 0,
  disabled = false,
  onChange
}: NumberFieldProps) {
  return (
    <label className={disabled ? "field field--off" : "field"}>
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={step}
        min={min}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

interface SecondsFieldProps {
  readonly caption: string;
  readonly ticks: number;
  readonly onChange: (ticks: number) => void;
}

/** The simulation counts 50 ms ticks; operators think in seconds. */
export function SecondsField({ caption, ticks, onChange }: SecondsFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">
        {caption} <span className="field__unit">{tickHint(ticks)}</span>
      </span>
      <input
        className="field__input"
        type="number"
        step={TICK_SECONDS}
        min={TICK_SECONDS}
        value={ticksToSeconds(ticks)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next > 0) onChange(secondsToTicks(next));
        }}
      />
    </label>
  );
}

interface DelayFieldProps {
  readonly caption: string;
  readonly ticks: number;
  readonly disabled?: boolean;
  readonly onChange: (ticks: number) => void;
}

/**
 * Seconds like `SecondsField`, except zero is a real value here and means the
 * delay is off. The shared converter deliberately floors at one tick, so this
 * one rounds for itself.
 */
export function DelayField({ caption, ticks, disabled = false, onChange }: DelayFieldProps) {
  return (
    <label className={disabled ? "field field--off" : "field"}>
      <span className="field__caption">
        {caption} <span className="field__unit">{tickHint(ticks)}</span>
      </span>
      <input
        className="field__input"
        type="number"
        step={TICK_SECONDS}
        min={0}
        disabled={disabled}
        value={ticksToSeconds(ticks)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0) {
            onChange(Math.max(0, Math.round(next / TICK_SECONDS)));
          }
        }}
      />
    </label>
  );
}

interface DegreesFieldProps {
  readonly caption: string;
  readonly radians: number;
  readonly onChange: (radians: number) => void;
}

/** The preset stores angles in radians; operators think in degrees. */
export function DegreesField({ caption, radians, onChange }: DegreesFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={1}
        min={1}
        value={Math.round((radians * 180) / Math.PI)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange((next * Math.PI) / 180);
        }}
      />
    </label>
  );
}

interface AngularRateFieldProps {
  readonly caption: string;
  readonly radians: number;
  /** Step in degrees; a rate needs a coarser one than an acceleration. */
  readonly step?: number;
  readonly onChange: (radians: number) => void;
}

/**
 * Angular rates and accelerations, in degrees the way the rest of the console
 * shows angles. The preset keeps radians because the simulation does its maths
 * in them; nothing outside this file should have to convert.
 */
export function AngularRateField({ caption, radians, step = 5, onChange }: AngularRateFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={step}
        min={1}
        value={Math.round((radians * 180) / Math.PI)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange((next * Math.PI) / 180);
        }}
      />
    </label>
  );
}

interface PercentFieldProps {
  readonly caption: string;
  readonly fraction: number;
  readonly onChange: (fraction: number) => void;
}

/** The preset stores a fraction of a capacity; operators think in percent. */
export function PercentField({ caption, fraction, onChange }: PercentFieldProps) {
  return (
    <label className="field">
      <span className="field__caption">{caption}</span>
      <input
        className="field__input"
        type="number"
        step={5}
        min={0}
        max={100}
        value={Math.round(fraction * 100)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next / 100);
        }}
      />
    </label>
  );
}
