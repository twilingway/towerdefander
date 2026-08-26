import { getVisualAsset, type EnemyArchetype } from "@spaceship-defender/protocol";

import { CatalogAssetShape } from "./catalogSvg.js";
import { SPACESHIP_WORLD_RADIUS, modelWorldRadius, previewScale } from "./enemyShapes.js";

const BOX = 148;
const CENTER = BOX / 2;

export interface EnemyPreviewProps {
  readonly archetype: EnemyArchetype;
}

/** Shows the drawn model against the hit radius it will really be shot at. */
export function EnemyPreview({ archetype }: EnemyPreviewProps) {
  const { visual } = archetype;
  const asset = getVisualAsset(visual.shape);
  const scale = previewScale(archetype.radius, visual.modelScale, visual.shape, BOX);
  const hitRadius = archetype.radius * scale.factor;
  const modelRadius = hitRadius * visual.modelScale;
  const shipRadius = SPACESHIP_WORLD_RADIUS * scale.factor;
  const barWidth = modelRadius * 1.8;
  const barHeight = Math.max(3, modelRadius * 0.12);
  const barTop = CENTER - modelRadius - barHeight * 2.4;

  return (
    <figure className="preview">
      <svg
        className="preview__canvas"
        viewBox={`0 0 ${String(BOX)} ${String(BOX)}`}
        role="img"
        aria-label={`Внешний вид: ${archetype.label} — ${asset.name}`}
      >
        <CatalogAssetShape asset={asset} radius={modelRadius} center={CENTER} />
        <circle className="preview__reference" cx={CENTER} cy={CENTER} r={shipRadius} />
        <circle className="preview__hitbox" cx={CENTER} cy={CENTER} r={hitRadius} />
        <text className="preview__tag preview__tag--hit" x={4} y={12}>
          ● поражение {archetype.radius}
        </text>
        <text className="preview__tag preview__tag--ship" x={4} y={BOX - 5}>
          ◌ корабль {SPACESHIP_WORLD_RADIUS}
        </text>
        {visual.showHealthBar ? (
          <g>
            <rect
              x={CENTER - barWidth / 2}
              y={barTop}
              width={barWidth}
              height={barHeight}
              fill="#2a0d16"
              stroke="#ffd1b0"
              strokeWidth={1.5}
            />
            <rect
              x={CENTER - barWidth / 2}
              y={barTop}
              width={barWidth * 0.65}
              height={barHeight}
              fill="#ff5f7a"
            />
          </g>
        ) : null}
      </svg>
      <figcaption className="preview__caption">
        <span className="preview__row preview__row--hit">сплошной круг — по нему бьют снаряды</span>
        <span className="preview__row preview__row--model">
          модель {modelWorldRadius(archetype.radius, visual.modelScale)}
          {scale.modelOverflows ? " (шире кадра)" : ""}
        </span>
        <span className="preview__key">пунктир — корпус корабля, только для сравнения</span>
      </figcaption>
    </figure>
  );
}
