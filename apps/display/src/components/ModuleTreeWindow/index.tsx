import { useState } from "react";
import { roleLabel } from "@spaceship-defender/client-shared";
import { formatShipStatEffect, summariseModuleEffects } from "@spaceship-defender/protocol";
import type { CrewRole, ShipStatEffectTuning } from "@spaceship-defender/protocol";

export interface ModuleTreeEntry {
  readonly id: string;
  readonly role: CrewRole;
  readonly label: string;
  readonly effects: readonly ShipStatEffectTuning[];
}

/** The effective numbers the display actually receives from the room. */
export interface ModuleTreeShip {
  readonly maxHp: number;
  readonly shieldCapacity: number;
  readonly shieldArcRadians: number;
  readonly shieldRadius: number;
}

interface ModuleTreeWindowProps {
  readonly tiers: readonly (readonly ModuleTreeEntry[])[];
  readonly endlessTier: readonly ModuleTreeEntry[];
  /** Bought modules in purchase order; their ids mark the path through the tree. */
  readonly purchased: readonly string[];
  readonly ship: ModuleTreeShip;
  /** Open on first render; a live run keeps it folded until someone asks. */
  readonly initiallyShown?: boolean;
}

const TIER_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * The whole tree at once, tier by tier from left to right, the way a tank line
 * is drawn: what the crew has taken, what is on offer this intermission, and
 * what is still ahead. A choice between two cards means nothing until the
 * branch behind it is visible.
 *
 * Which tier is open follows the purchase count, the same rule `availableTierIndex`
 * runs in the core — the wave does not gate it.
 */
export function ModuleTreeWindow({
  tiers,
  endlessTier,
  purchased,
  ship,
  initiallyShown = false
}: ModuleTreeWindowProps) {
  // The tree covers the stage and every overlay on purpose, so it has to be
  // dismissable: it answers a question, and then it is in the way.
  const [shown, setShown] = useState(initiallyShown);
  const bought = new Set(purchased);
  const openIndex = Math.min(purchased.length, tiers.length);
  const gains = summariseGains(tiers, endlessTier, purchased);
  return (
    <aside
      className={`module-tree${shown ? "" : " module-tree--collapsed"}`}
      aria-label="Дерево модулей корабля"
    >
      <header className="module-tree__header">
        <button
          type="button"
          className="module-tree__toggle"
          aria-expanded={shown}
          onClick={() => {
            setShown((value) => !value);
          }}
        >
          {shown ? "Скрыть дерево" : "Дерево корабля"}
        </button>
        {shown && (
          <small>
            {openIndex >= tiers.length
              ? `Дерево пройдено: ${String(purchased.length)} модулей, дальше повторяемые`
              : `Тир ${String(openIndex + 1)} из ${String(tiers.length)} · куплено ${String(purchased.length)}`}
          </small>
        )}
      </header>
      {shown && (
        <div className="module-tree__grid">
          {tiers.map((modules, index) => (
            <TierColumn
              key={modules[0]?.id ?? index}
              caption={TIER_NUMERALS[index] ?? String(index + 1)}
              modules={modules}
              bought={bought}
              open={index === openIndex}
            />
          ))}
          <TierColumn
            caption="∞"
            modules={endlessTier}
            bought={bought}
            open={openIndex >= tiers.length}
          />
        </div>
      )}
      {shown && (
        <footer className="module-tree__stats">
          <dl className="module-tree__facts" aria-label="Характеристики корабля">
            <Fact caption="Корпус" value={`${String(Math.round(ship.maxHp))} ед.`} />
            <Fact caption="Ёмкость щита" value={String(Math.round(ship.shieldCapacity))} />
            <Fact
              caption="Сектор щита"
              value={`${String(Math.round((ship.shieldArcRadians * 180) / Math.PI))}°`}
            />
            <Fact caption="Радиус щита" value={String(Math.round(ship.shieldRadius))} />
          </dl>
          <div className="module-tree__gains" aria-label="Что уже дали модули">
            <span className="module-tree__gains-caption">Уже дало дерево</span>
            {gains.length === 0 ? (
              <em>ничего не куплено</em>
            ) : (
              <ul>
                {gains.map((effect) => (
                  <li key={`${effect.target}:${effect.op}`}>{formatShipStatEffect(effect)}</li>
                ))}
              </ul>
            )}
          </div>
        </footer>
      )}
    </aside>
  );
}

function Fact({ caption, value }: { readonly caption: string; readonly value: string }) {
  return (
    <div>
      <dt>{caption}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * What the purchases add up to, per stat and per kind of arithmetic.
 *
 * The same three rules the core applies when it builds the ship: additions sum,
 * percents sum, multipliers multiply — so a repeatable module bought twice
 * counts twice, and the list reads as one line per stat the crew changed.
 */
export function summariseGains(
  tiers: readonly (readonly ModuleTreeEntry[])[],
  endlessTier: readonly ModuleTreeEntry[],
  purchased: readonly string[]
): readonly ShipStatEffectTuning[] {
  const modules = new Map<string, ModuleTreeEntry>();
  for (const tier of [...tiers, endlessTier]) {
    for (const module of tier) modules.set(module.id, module);
  }
  const totals = new Map<string, ShipStatEffectTuning>();
  for (const id of purchased) {
    const module = modules.get(id);
    if (module === undefined) continue;
    for (const effect of module.effects) {
      const key = `${effect.target}:${effect.op}`;
      const carried = totals.get(key);
      if (carried === undefined) {
        totals.set(key, { ...effect });
        continue;
      }
      totals.set(key, {
        ...carried,
        value:
          effect.op === "multiply" ? carried.value * effect.value : carried.value + effect.value
      });
    }
  }
  return [...totals.values()];
}

function TierColumn({
  caption,
  modules,
  bought,
  open
}: {
  readonly caption: string;
  readonly modules: readonly ModuleTreeEntry[];
  readonly bought: ReadonlySet<string>;
  readonly open: boolean;
}) {
  return (
    <div className={`module-tree__tier${open ? " is-open" : ""}`}>
      <span className="module-tree__numeral">{caption}</span>
      <ul className="module-tree__cells">
        {modules.map((module) => {
          const taken = bought.has(module.id);
          return (
            <li
              key={module.id}
              className={`module-tree__cell${taken ? " is-taken" : ""}${
                open && !taken ? " is-open" : ""
              }`}
              data-role={module.role}
              data-module-id={module.id}
            >
              <strong>{module.label}</strong>
              <small>{summariseModuleEffects(module.effects)}</small>
              <small className="module-tree__seat">{roleLabel(module.role)}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
