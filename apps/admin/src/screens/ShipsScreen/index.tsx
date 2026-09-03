import {
  MAX_SHIP_ARCHETYPES,
  MODULE_TIER_WIDTHS,
  type BalanceTuning,
  type ShipArchetype,
  type ShipModule
} from "@spaceship-defender/protocol";

import { HullCard } from "./HullCard.js";

interface ShipsScreenProps {
  readonly tuning: BalanceTuning;
  readonly onChange: (tuning: BalanceTuning) => void;
}

function nextHullId(tuning: BalanceTuning): string {
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `hull${String(suffix)}`;
    if (!Object.hasOwn(tuning.shipArchetypes, candidate)) return candidate;
  }
  return `hull${String(Date.now())}`;
}

/**
 * A new hull starts as a copy of the base one.
 *
 * Authoring 26 modules from an empty form is not a thing anyone finishes, and
 * the schema refuses a tree of the wrong shape — so the blank hull is the
 * working tree with fresh ids, and the operator edits from there.
 */
function copyOfBase(base: ShipArchetype, id: string): ShipArchetype {
  const rename = (module: ShipModule, tier: number, slot: number): ShipModule => ({
    ...module,
    id: `${id}T${String(tier)}m${String(slot)}`,
    effects: module.effects.map((effect) => ({ ...effect }))
  });
  return {
    ...base,
    label: "Новый корпус",
    description: "Опишите, чем этот корпус играется иначе.",
    overrides: { stats: {}, cannonWeaponKind: null, mgWeaponKind: null },
    tiers: base.tiers.map((tier, tierIndex) =>
      tier.map((module, slot) => rename(module, tierIndex + 1, slot))
    ),
    endlessTier: base.endlessTier.map((module, slot) => rename(module, 0, slot))
  };
}

export function ShipsScreen({ tuning, onChange }: ShipsScreenProps) {
  const ids = Object.keys(tuning.shipArchetypes).sort();
  const base = tuning.shipArchetypes[tuning.defaultShipArchetypeId];

  const patchHull = (id: string, hull: ShipArchetype): void => {
    onChange({ ...tuning, shipArchetypes: { ...tuning.shipArchetypes, [id]: hull } });
  };

  const addHull = (): void => {
    if (ids.length >= MAX_SHIP_ARCHETYPES || base === undefined) return;
    const id = nextHullId(tuning);
    onChange({
      ...tuning,
      shipArchetypes: { ...tuning.shipArchetypes, [id]: copyOfBase(base, id) }
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Корабли</h2>
        <p className="screen__hint">
          Каждый корпус — это набор отличий от базового корабля и своё дерево из десяти тиров.
          Экипаж выбирает корпус на экране создания комнаты; прогон получает его статы и его дерево,
          и внутри прогона корпус не меняется. Базовый корпус ничего не переопределяет, поэтому
          прогон на нём — это игра ровно такая, какой она описана на вкладке «Игрок».
        </p>
      </header>

      <article className="card">
        <h3 className="card__subtitle">Каталог</h3>
        <p className="screen__hint">
          Корпусов до {MAX_SHIP_ARCHETYPES}. Ширины тиров — {MODULE_TIER_WIDTHS.join(", ")} —
          правило игры, а не настройка: их задаёт код, и пресет с другой формой сервер не примет.
          Базовый корпус достаётся комнате, создатель которой не назвал корабль, — например старому
          клиенту.
        </p>
        <div className="card__grid">
          <label className="field">
            <span className="field__caption">Базовый корпус</span>
            <select
              className="field__input"
              value={tuning.defaultShipArchetypeId}
              onChange={(event) => {
                onChange({ ...tuning, defaultShipArchetypeId: event.target.value });
              }}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {tuning.shipArchetypes[id]?.label ?? id}
                </option>
              ))}
            </select>
          </label>
          {ids.length < MAX_SHIP_ARCHETYPES && (
            <button type="button" className="button" onClick={addHull}>
              Добавить корпус
            </button>
          )}
        </div>
      </article>

      {ids.map((id) => {
        const hull = tuning.shipArchetypes[id];
        if (hull === undefined) return null;
        return (
          <HullCard
            key={id}
            id={id}
            hull={hull}
            isDefault={id === tuning.defaultShipArchetypeId}
            canRemove={ids.length > 1}
            onChange={(next) => {
              patchHull(id, next);
            }}
            onMakeDefault={() => {
              onChange({ ...tuning, defaultShipArchetypeId: id });
            }}
            onRemove={() => {
              onChange({
                ...tuning,
                shipArchetypes: Object.fromEntries(
                  Object.entries(tuning.shipArchetypes).filter(([candidate]) => candidate !== id)
                )
              });
            }}
          />
        );
      })}
    </section>
  );
}
