import { useRef } from "react";
import { balancePresetsFileSchema, type BalancePresetsFile } from "@spaceship-defender/protocol";

import { activePresetOf } from "../../model/tuning.js";

interface PresetsScreenProps {
  readonly document: BalancePresetsFile;
  readonly onChange: (document: BalancePresetsFile) => void;
  readonly onImportError: (message: string) => void;
}

export function PresetsScreen({
  document: balanceDocument,
  onChange,
  onImportError
}: PresetsScreenProps) {
  const fileInput = useRef<HTMLInputElement | null>(null);

  const duplicateActive = (): void => {
    const active = activePresetOf(balanceDocument);
    if (active === undefined) return;
    const id = `${active.id}-copy-${String(balanceDocument.presets.length + 1)}`;
    onChange({
      ...balanceDocument,
      activePresetId: id,
      presets: [...balanceDocument.presets, { ...active, id, name: `${active.name} (копия)` }]
    });
  };

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Пресеты</h2>
        <p className="screen__hint">
          Активный пресет применяется к следующему запуску боя, идущий бой не меняется.
        </p>
      </header>

      <ul className="presets">
        {balanceDocument.presets.map((preset) => (
          <li className="presets__item" key={preset.id}>
            <label className="presets__pick">
              <input
                type="radio"
                name="active-preset"
                checked={preset.id === balanceDocument.activePresetId}
                onChange={() => {
                  onChange({ ...balanceDocument, activePresetId: preset.id });
                }}
              />
              <span>
                <strong>{preset.name}</strong>
                <code>{preset.id}</code>
              </span>
            </label>
            <button
              className="button button--ghost"
              type="button"
              disabled={balanceDocument.presets.length === 1}
              onClick={() => {
                const remaining = balanceDocument.presets.filter(({ id }) => id !== preset.id);
                const fallback = remaining[0];
                if (fallback === undefined) return;
                onChange({
                  ...balanceDocument,
                  activePresetId:
                    balanceDocument.activePresetId === preset.id
                      ? fallback.id
                      : balanceDocument.activePresetId,
                  presets: remaining
                });
              }}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>

      <div className="row">
        <button className="button" type="button" onClick={duplicateActive}>
          Копировать активный
        </button>
        <a
          className="button"
          download="balance.json"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(
            JSON.stringify(balanceDocument, null, 2)
          )}`}
        >
          Экспорт JSON
        </a>
        <button
          className="button"
          type="button"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Импорт JSON
        </button>
        <input
          ref={fileInput}
          className="hidden-input"
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file === undefined) return;
            void file.text().then((text) => {
              try {
                onChange(balancePresetsFileSchema.parse(JSON.parse(text)));
              } catch {
                onImportError("Файл не является корректным документом баланса.");
              }
            });
          }}
        />
      </div>
    </section>
  );
}
