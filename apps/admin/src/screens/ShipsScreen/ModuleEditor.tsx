import {
  CREW_ROLES,
  MAX_MODULE_EFFECTS,
  MODULE_TARGET_FIELDS,
  MODULE_TARGET_LABELS,
  SHIP_STAT_OPS,
  summariseModuleEffects,
  type CrewRole,
  type ModuleTargetField,
  type ShipModule,
  type ShipStatEffectTuning,
  type ShipStatOp
} from "@spaceship-defender/protocol";

const ROLE_LABELS: Record<CrewRole, string> = {
  pilot: "Пилот",
  gunner: "Стрелок",
  shield: "Щит"
};

const OP_LABELS: Record<ShipStatOp, string> = {
  add: "прибавить",
  percent: "процент",
  multiply: "умножить"
};

interface ModuleEditorProps {
  readonly module: ShipModule;
  readonly onChange: (module: ShipModule) => void;
}

/**
 * One card of the tree.
 *
 * The caption is shown, not typed: it is assembled from the effects by the same
 * function the display uses, so what the operator reads here is what the crew
 * reads in the game, and neither can drift from the number that gets applied.
 */
export function ModuleEditor({ module, onChange }: ModuleEditorProps) {
  const patchEffect = (index: number, effect: Partial<ShipStatEffectTuning>): void => {
    onChange({
      ...module,
      effects: module.effects.map((current, at) =>
        at === index ? { ...current, ...effect } : current
      )
    });
  };

  return (
    <article className="module-card">
      <div className="card__grid">
        <label className="field">
          <span className="field__caption">Название</span>
          <input
            className="field__input"
            value={module.label}
            maxLength={48}
            onChange={(event) => {
              onChange({ ...module, label: event.target.value });
            }}
          />
        </label>
        <label className="field">
          <span className="field__caption">Роль</span>
          <select
            className="field__input"
            value={module.role}
            onChange={(event) => {
              onChange({ ...module, role: event.target.value as CrewRole });
            }}
          >
            {CREW_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__caption">Идентификатор</span>
          <input
            className="field__input"
            value={module.id}
            maxLength={48}
            onChange={(event) => {
              onChange({ ...module, id: event.target.value });
            }}
          />
        </label>
      </div>

      {module.effects.map((effect, index) => (
        <div className="card__grid" key={`${module.id}-${String(index)}`}>
          <label className="field">
            <span className="field__caption">Что меняет</span>
            <select
              className="field__input"
              value={effect.target}
              onChange={(event) => {
                patchEffect(index, { target: event.target.value as ModuleTargetField });
              }}
            >
              {MODULE_TARGET_FIELDS.map((target) => (
                <option key={target} value={target}>
                  {MODULE_TARGET_LABELS[target]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__caption">Как</span>
            <select
              className="field__input"
              value={effect.op}
              onChange={(event) => {
                patchEffect(index, { op: event.target.value as ShipStatOp });
              }}
            >
              {SHIP_STAT_OPS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__caption">Сколько</span>
            <input
              className="field__input"
              type="number"
              step={0.01}
              value={effect.value}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) patchEffect(index, { value: next });
              }}
            />
          </label>
          {module.effects.length > 1 && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                onChange({
                  ...module,
                  effects: module.effects.filter((_unused, at) => at !== index)
                });
              }}
            >
              Убрать эффект
            </button>
          )}
        </div>
      ))}

      <div className="card__grid">
        {module.effects.length < MAX_MODULE_EFFECTS && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              onChange({
                ...module,
                effects: [
                  ...module.effects,
                  { target: "spaceshipMaxHp", op: "add", value: 10 } satisfies ShipStatEffectTuning
                ]
              });
            }}
          >
            Добавить эффект
          </button>
        )}
      </div>

      <p className="screen__hint">
        Подпись на карточке: <b>{summariseModuleEffects(module.effects)}</b>
      </p>
    </article>
  );
}
