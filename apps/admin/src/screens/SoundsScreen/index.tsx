import { useState, type ReactElement } from "react";
import { SOUND_SHAPES } from "@spaceship-defender/audio-assets";
import {
  SOUND_CATEGORIES,
  SOUND_CATEGORY_LABELS,
  SOUND_CATEGORY_OF,
  SOUND_IDS,
  SOUND_LABELS,
  type SoundCategory,
  type SoundId
} from "@spaceship-defender/protocol";

import { playPreview } from "../../components/soundPreview.js";

const ALL = "all";

/**
 * The catalogue of sounds.
 *
 * Read-only, exactly like the effects page beside it and for the same reason:
 * this says what exists and what it is made of, so a sound can be listened to
 * before it is hung on a hull or an archetype. Assigning one is done on the
 * ships and enemies pages, where the choice lands in the preset.
 *
 * Adding or removing a file is a repository change rather than a console one -
 * the bytes live in `@spaceship-defender/audio-assets` and the legal ids in the
 * protocol, so a sound the console could delete would be a sound a preset could
 * still name. The page says where to put one instead.
 */
export function SoundsScreen(): ReactElement {
  const [filter, setFilter] = useState<SoundCategory | typeof ALL>(ALL);
  const chips: readonly (SoundCategory | typeof ALL)[] = [ALL, ...SOUND_CATEGORIES];
  const shown =
    filter === ALL ? SOUND_IDS : SOUND_IDS.filter((id) => SOUND_CATEGORY_OF[id] === filter);

  return (
    <section className="screen">
      <header className="screen__header">
        <h2>Звуки</h2>
        <p className="screen__hint">
          Файлы из <code>packages/audio-assets</code>, те же самые, что играет дисплей. Назначаются
          они на вкладках «Корабли» и «Враги» — здесь их можно только послушать и сравнить. Чтобы
          добавить новый: положить файл в <code>sounds/</code>, назвать его в{" "}
          <code>audioCatalogue.ts</code> и описать в <code>SOUND_SHAPES</code>; тесты не дадут этим
          трём разойтись.
        </p>
      </header>

      <nav aria-label="Группы звуков" className="fx-filter">
        {chips.map((candidate) => (
          <button
            className={`fx-filter__chip${candidate === filter ? " fx-filter__chip--active" : ""}`}
            data-testid={`sound-filter-${candidate}`}
            key={candidate}
            onClick={() => {
              setFilter(candidate);
            }}
            type="button"
          >
            {candidate === ALL ? "Все" : SOUND_CATEGORY_LABELS[candidate]}
          </button>
        ))}
      </nav>

      <ul className="sound-grid" data-testid="sound-grid">
        {shown.map((id: SoundId) => (
          <li className="card sound-card" key={id}>
            <div className="sound-card__head">
              <strong>{SOUND_LABELS[id]}</strong>
              <button
                type="button"
                className="button button--ghost sound-slots__play"
                data-testid={`sound-play-${id}`}
                onClick={() => {
                  playPreview(id);
                }}
              >
                ▶
              </button>
            </div>
            <code className="sound-card__id">{id}</code>
            <p className="hint">{describe(id)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What is actually inside the file, in the terms the display cares about.
 *
 * A burst is not a shot: the display plays a burst sample once per the rounds
 * it contains and stretches it onto the weapon's own rate of fire, so whether
 * a sound is one round or eight decides how it behaves in a fight.
 */
function describe(id: SoundId): string {
  const shape = SOUND_SHAPES[id];
  if (shape === undefined || shape.shots <= 1) return "Одно событие: играется целиком каждый раз.";
  return `Очередь: ${String(shape.shots)} выстрелов с шагом ${String(shape.shotGapMs)} мс. Дисплей запускает её раз в ${String(shape.shots)} выстрелов и подгоняет под темп оружия.`;
}
